/**
 * Recorrências e assinaturas.
 *
 * Cada ocorrência tem uma CHAVE DE PERÍODO estável (ex.: "sub_1:2026-10").
 * O banco possui UNIQUE(subscription_id, period_key), então gerar as
 * cobranças duas vezes — ou após trocar o dia de cobrança dentro do mesmo
 * mês — nunca duplica nada. A geração é idempotente por construção.
 */
import { addDays, addMonths, compareDates, diffDays, parseDate, type LocalDate } from "./dates";
import { assertCents, mulDiv, type Cents } from "./money";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: Frequency;
  /** a cada N unidades (ex.: monthly + 3 = trimestral; daily + 15 = quinzenal) */
  interval: number;
  startDate: LocalDate;
  endDate?: LocalDate | null;
  /** número máximo de ocorrências */
  count?: number | null;
}

export function validateRule(r: RecurrenceRule): void {
  if (!Number.isInteger(r.interval) || r.interval < 1 || r.interval > 366) throw new Error("Intervalo inválido");
  parseDate(r.startDate);
  if (r.endDate && compareDates(r.endDate, r.startDate) < 0) throw new Error("Fim antes do início");
}

/** n-ésima ocorrência calculada sempre a partir do início (sem deriva: 31/01 → 28/02 → 31/03). */
export function nthOccurrence(r: RecurrenceRule, n: number): LocalDate {
  const anchorDay = parseDate(r.startDate).day;
  switch (r.frequency) {
    case "daily":
      return addDays(r.startDate, n * r.interval);
    case "weekly":
      return addDays(r.startDate, n * 7 * r.interval);
    case "monthly":
      return addMonths(r.startDate, n * r.interval, anchorDay);
    case "yearly":
      return addMonths(r.startDate, n * 12 * r.interval, anchorDay);
  }
}

export function occurrences(r: RecurrenceRule, from: LocalDate, to: LocalDate): LocalDate[] {
  validateRule(r);
  const out: LocalDate[] = [];
  // pula direto para perto de `from` em regras diárias/semanais longas
  let n = 0;
  if ((r.frequency === "daily" || r.frequency === "weekly") && from > r.startDate) {
    const step = r.interval * (r.frequency === "weekly" ? 7 : 1);
    n = Math.max(0, Math.floor(diffDays(from, r.startDate) / step) - 1);
  }
  for (let guard = 0; guard < 10_000; guard++, n++) {
    if (r.count != null && n >= r.count) break;
    const d = nthOccurrence(r, n);
    if (d > to) break;
    if (r.endDate && d > r.endDate) break;
    if (d >= from) out.push(d);
  }
  return out;
}

/** Chave estável do período de uma ocorrência. */
export function periodKey(r: RecurrenceRule, date: LocalDate): string {
  switch (r.frequency) {
    case "monthly":
      return date.slice(0, 7);
    case "yearly":
      return date.slice(0, 4);
    case "weekly": {
      // segunda-feira da semana
      const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
      return `W${addDays(date, -dow)}`;
    }
    case "daily":
      return date;
  }
}

/** Equivalente mensal com arredondamento explícito (half-even). */
export function monthlyEquivalent(amount: Cents, r: Pick<RecurrenceRule, "frequency" | "interval">): Cents {
  assertCents(amount);
  switch (r.frequency) {
    case "monthly":
      return mulDiv(amount, 1, r.interval);
    case "yearly":
      return mulDiv(amount, 1, 12 * r.interval);
    case "weekly":
      return mulDiv(amount, 52, 12 * r.interval);
    case "daily":
      return mulDiv(amount, 365, 12 * r.interval);
  }
}

// ------------------------------------------------------------ assinaturas

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface PriceChange {
  effectiveFrom: LocalDate;
  amount: Cents;
}

export interface Subscription {
  id: string;
  name: string;
  rule: RecurrenceRule;
  /** histórico de preços; o vigente numa data é o último com effectiveFrom <= data */
  prices: readonly PriceChange[];
  status: SubscriptionStatus;
  pausedFrom?: LocalDate | null;
  pausedUntil?: LocalDate | null;
  cancelledAt?: LocalDate | null;
}

export function priceAt(sub: Subscription, date: LocalDate): Cents {
  const sorted = [...sub.prices].sort((a, b) => compareDates(a.effectiveFrom, b.effectiveFrom));
  let current: Cents | null = null;
  for (const p of sorted) if (p.effectiveFrom <= date) current = p.amount;
  if (current === null) {
    if (!sorted[0]) throw new Error(`Assinatura ${sub.name} sem preço`);
    current = sorted[0].amount;
  }
  return current;
}

export interface Occurrence {
  subscriptionId: string;
  periodKey: string;
  date: LocalDate;
  amount: Cents;
}

export function subscriptionOccurrences(sub: Subscription, from: LocalDate, to: LocalDate): Occurrence[] {
  return occurrences(sub.rule, from, to)
    .filter((d) => {
      if (sub.cancelledAt && d >= sub.cancelledAt) return false;
      if (sub.status === "cancelled" && !sub.cancelledAt) return false;
      if (sub.pausedFrom && d >= sub.pausedFrom && (!sub.pausedUntil || d <= sub.pausedUntil)) return false;
      return true;
    })
    .map((date) => ({ subscriptionId: sub.id, periodKey: periodKey(sub.rule, date), date, amount: priceAt(sub, date) }));
}

/**
 * Retorna apenas as ocorrências que ainda não existem. Executar duas vezes
 * com o mesmo `existing` (ou depois de persistir o resultado) nunca gera
 * duplicatas. O banco reforça a regra com uma restrição UNIQUE.
 */
export function pendingOccurrences(
  sub: Subscription,
  from: LocalDate,
  to: LocalDate,
  existingPeriodKeys: ReadonlySet<string>,
): Occurrence[] {
  const seen = new Set(existingPeriodKeys);
  const out: Occurrence[] = [];
  for (const o of subscriptionOccurrences(sub, from, to)) {
    if (seen.has(o.periodKey)) continue;
    seen.add(o.periodKey);
    out.push(o);
  }
  return out;
}
