/** Assinaturas: rótulos, próxima cobrança, totais e o que lançar automaticamente. */
import { addDays, maxDate, type LocalDate } from "./dates";
import type { Cents } from "./money";
import { monthlyEquivalent, priceAt, subscriptionOccurrences, type Frequency, type Occurrence, type Subscription } from "./recurrence";

export interface FrequencyPreset {
  key: string;
  label: string;
  frequency: Frequency;
  interval: number;
}

export const FREQUENCY_PRESETS: FrequencyPreset[] = [
  { key: "monthly", label: "Mensal", frequency: "monthly", interval: 1 },
  { key: "yearly", label: "Anual", frequency: "yearly", interval: 1 },
  { key: "quarterly", label: "Trimestral", frequency: "monthly", interval: 3 },
  { key: "semiannual", label: "Semestral", frequency: "monthly", interval: 6 },
  { key: "weekly", label: "Semanal", frequency: "weekly", interval: 1 },
  { key: "biweekly", label: "A cada 2 semanas", frequency: "weekly", interval: 2 },
];

export function presetOf(frequency: Frequency, interval: number): FrequencyPreset | undefined {
  return FREQUENCY_PRESETS.find((p) => p.frequency === frequency && p.interval === interval);
}

/** "Mensal", "a cada 2 meses", "Anual"... */
export function frequencyLabel(frequency: Frequency, interval: number): string {
  const p = presetOf(frequency, interval);
  if (p) return p.label;
  const unit = { daily: ["dia", "dias"], weekly: ["semana", "semanas"], monthly: ["mês", "meses"], yearly: ["ano", "anos"] }[frequency];
  return `A cada ${interval} ${interval === 1 ? unit[0] : unit[1]}`;
}

/** Sufixo curto para o preço: "/mês", "/ano", "/3 meses". */
export function perLabel(frequency: Frequency, interval: number): string {
  const unit = { daily: ["dia", "dias"], weekly: ["semana", "semanas"], monthly: ["mês", "meses"], yearly: ["ano", "anos"] }[frequency];
  return interval === 1 ? `/${unit[0]}` : `/${interval} ${unit[1]}`;
}

/** Próxima cobrança a partir de hoje (inclusive), ou null se não houver mais. */
export function nextCharge(sub: Subscription, today: LocalDate, horizonDays = 800): Occurrence | null {
  if (sub.status === "cancelled" && (!sub.cancelledAt || sub.cancelledAt <= today)) return null;
  return subscriptionOccurrences(sub, today, addDays(today, horizonDays))[0] ?? null;
}

/**
 * Cobranças que já venceram e ainda não foram lançadas: de `chargedThrough + 1`
 * (ou do início) até hoje, sem repetir períodos existentes.
 */
export function dueToRecord(sub: Subscription, chargedThrough: LocalDate | null, today: LocalDate, existingKeys: ReadonlySet<string>): Occurrence[] {
  const from = chargedThrough ? maxDate(addDays(chargedThrough, 1), sub.rule.startDate) : sub.rule.startDate;
  if (from > today) return [];
  return subscriptionOccurrences(sub, from, today).filter((o) => !existingKeys.has(o.periodKey));
}

/** Cobranças futuras (ainda não lançadas) para a projeção do saldo. */
export function upcoming(sub: Subscription, chargedThrough: LocalDate | null, today: LocalDate, to: LocalDate, existingKeys: ReadonlySet<string>): Occurrence[] {
  const after = maxDate(today, chargedThrough ?? today);
  return subscriptionOccurrences(sub, addDays(after, 1), to).filter((o) => !existingKeys.has(o.periodKey));
}

export interface SubscriptionTotals {
  monthly: Cents;
  yearly: Cents;
  activeCount: number;
}

/** Custo das assinaturas ativas: equivalente mensal (half-even) e anual (12×). */
export function subscriptionTotals(subs: readonly Subscription[], today: LocalDate): SubscriptionTotals {
  let monthly = 0;
  let activeCount = 0;
  for (const s of subs) {
    if (s.status !== "active") continue;
    activeCount++;
    monthly += monthlyEquivalent(priceAt(s, today), { frequency: s.rule.frequency, interval: s.rule.interval });
  }
  return { monthly: monthly as Cents, yearly: (monthly * 12) as Cents, activeCount };
}
