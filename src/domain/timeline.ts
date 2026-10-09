/**
 * Linha do tempo financeira: projeção dia a dia do saldo das contas.
 *
 * Parte do saldo REAL de hoje e aplica, em ordem:
 *  - lançamentos agendados/previstos em conta (receitas, despesas, transferências),
 *  - o saldo restante de cada fatura de cartão no seu vencimento
 *    (descontando pagamentos já agendados para aquela fatura),
 *  - eventos hipotéticos de simulação (nunca persistidos).
 * Lançamentos pendentes com data passada aparecem HOJE como "atrasados".
 * Receitas apenas previstas só entram se o usuário permitir.
 */
import { computeInvoices, type CardBillingConfig, type CardCharge, type CardPayment } from "./billing";
import { addDays, compareDates, eachDay, maxDate, type LocalDate } from "./dates";
import { consolidatedBalance, type Account, type AccountEntry } from "./ledger";
import { sum, type Cents } from "./money";

export type TimelineStatus = "realized" | "confirmed" | "expected" | "late" | "hypothetical";

export interface TimelineEvent {
  date: LocalDate;
  amount: Cents;
  label: string;
  status: TimelineStatus;
  source: "entry" | "invoice" | "simulation";
  refId: string;
  /** data original quando o evento foi movido para hoje por atraso */
  originalDate?: LocalDate;
}

export interface TimelineCard {
  id: string;
  name: string;
  config: CardBillingConfig;
  paymentAccountId: string | null;
  charges: readonly CardCharge[];
  payments: readonly CardPayment[];
}

export interface TimelineInput {
  today: LocalDate;
  to: LocalDate;
  accounts: readonly Account[];
  entries: readonly AccountEntry[];
  cards: readonly TimelineCard[];
  includeExpectedIncome: boolean;
  /** limita a projeção a algumas contas (padrão: todas as ativas) */
  accountIds?: readonly string[];
  hypothetical?: readonly Omit<TimelineEvent, "status" | "source">[];
  /** eventos já realizados entre hoje e `to` para exibição */
  showRealizedToday?: boolean;
}

export interface TimelineDay {
  date: LocalDate;
  opening: Cents;
  inflow: Cents;
  outflow: Cents;
  closing: Cents;
  events: TimelineEvent[];
}

export interface TimelineResult {
  startBalance: Cents;
  endBalance: Cents;
  minBalance: Cents;
  minBalanceDate: LocalDate;
  firstNegativeDate: LocalDate | null;
  negativeDays: LocalDate[];
  days: TimelineDay[];
  events: TimelineEvent[];
}

export function buildTimeline(input: TimelineInput): TimelineResult {
  const { today, to } = input;
  if (compareDates(to, today) < 0) throw new Error("O fim do período deve ser hoje ou depois");

  const accounts = input.accounts.filter(
    (a) => !a.archived && (!input.accountIds || input.accountIds.includes(a.id)),
  );
  const ids = new Set(accounts.map((a) => a.id));
  const startBalance = consolidatedBalance(accounts, input.entries, today);

  const events: TimelineEvent[] = [];

  // 1) lançamentos em conta ainda não realizados
  const scheduledInvoicePayments = new Map<string, number>();
  for (const e of input.entries) {
    if (!ids.has(e.accountId) || e.hypothetical) continue;
    const realized = e.status === "confirmed" && e.date <= today;
    if (realized) {
      if (input.showRealizedToday && e.date === today) {
        events.push({ date: today, amount: e.amount, label: e.description ?? kindLabel(e), status: "realized", source: "entry", refId: e.id });
      }
      continue;
    }
    if (e.date > to) continue;
    if (e.kind === "invoice_payment" && e.cardId && e.invoiceRef) {
      const key = `${e.cardId}|${e.invoiceRef}`;
      scheduledInvoicePayments.set(key, (scheduledInvoicePayments.get(key) ?? 0) + -e.amount);
    }
    // transferência entre duas contas incluídas: os dois lados se anulam no consolidado,
    // mas mantemos ambos para a visão por conta.
    const isExpectedIncome = e.status === "expected" && e.amount > 0;
    if (isExpectedIncome && !input.includeExpectedIncome) continue;
    const late = e.date < today;
    events.push({
      date: late ? today : e.date,
      originalDate: late ? e.date : undefined,
      amount: e.amount,
      label: e.description ?? kindLabel(e),
      status: late ? "late" : e.status === "expected" ? "expected" : "confirmed",
      source: "entry",
      refId: e.id,
    });
  }

  // 2) faturas de cartão a pagar pelas contas incluídas
  for (const card of input.cards) {
    if (card.paymentAccountId && !ids.has(card.paymentAccountId)) continue;
    if (!card.paymentAccountId && input.accountIds) continue;
    const invoices = computeInvoices(card.config, card.charges, card.payments, today);
    for (const inv of invoices) {
      if (inv.remaining <= 0 || inv.dueDate > to) continue;
      const scheduled = scheduledInvoicePayments.get(`${card.id}|${inv.ref}`) ?? 0;
      const pending = inv.remaining - scheduled;
      if (pending <= 0) continue;
      const late = inv.dueDate < today;
      const hasHypothetical = card.charges.some((c) => c.hypothetical && c.invoiceRef === inv.ref && !c.cancelled);
      events.push({
        date: late ? today : inv.dueDate,
        originalDate: late ? inv.dueDate : undefined,
        amount: -pending as Cents,
        label: `Fatura ${card.name}`,
        status: late ? "late" : hasHypothetical ? "hypothetical" : "confirmed",
        source: "invoice",
        refId: `${card.id}|${inv.ref}`,
      });
    }
  }

  // 3) simulação
  for (const h of input.hypothetical ?? []) {
    if (h.date > to) continue;
    events.push({ ...h, date: maxDate(h.date, today), status: "hypothetical", source: "simulation" });
  }

  events.sort((a, b) => compareDates(a.date, b.date) || b.amount - a.amount);

  // 4) dia a dia
  const days: TimelineDay[] = [];
  let running: number = startBalance;
  let minBalance: number = startBalance;
  let minBalanceDate = today;
  let firstNegativeDate: LocalDate | null = startBalance < 0 ? today : null;
  const negativeDays: LocalDate[] = [];
  const byDate = new Map<LocalDate, TimelineEvent[]>();
  for (const ev of events) byDate.set(ev.date, [...(byDate.get(ev.date) ?? []), ev]);

  for (const date of eachDay(today, to)) {
    const evs = byDate.get(date) ?? [];
    const flows = evs.filter((e) => e.status !== "realized");
    const inflow = sum(flows.filter((e) => e.amount > 0).map((e) => e.amount));
    const outflow = sum(flows.filter((e) => e.amount < 0).map((e) => -e.amount));
    const opening = running;
    running = opening + inflow - outflow;
    if (running < minBalance) {
      minBalance = running;
      minBalanceDate = date;
    }
    if (running < 0) {
      negativeDays.push(date);
      firstNegativeDate ??= date;
    }
    days.push({ date, opening: opening as Cents, inflow, outflow, closing: running as Cents, events: evs });
  }

  return {
    startBalance,
    endBalance: running as Cents,
    minBalance: minBalance as Cents,
    minBalanceDate,
    firstNegativeDate,
    negativeDays,
    days,
    events,
  };
}

function kindLabel(e: AccountEntry): string {
  switch (e.kind) {
    case "income":
      return "Receita";
    case "expense":
      return "Despesa";
    case "transfer":
      return e.amount < 0 ? "Transferência enviada" : "Transferência recebida";
    case "invoice_payment":
      return "Pagamento de fatura";
    case "refund":
      return "Reembolso";
    case "adjustment":
      return "Ajuste de saldo";
  }
}

// ------------------------------------------------- "Quanto posso gastar?"

export interface FreeToSpendOptions {
  reserve: Cents;
  safetyMargin?: Cents;
}

export interface FreeToSpendResult {
  currentBalance: Cents;
  projectedBalance: Cents;
  lowestBalance: Cents;
  lowestBalanceDate: LocalDate;
  freeToSpend: Cents;
  /** saldo projetado fica negativo em algum dia, mesmo que termine positivo */
  negativeAlert: boolean;
  firstNegativeDate: LocalDate | null;
  belowReserveAlert: boolean;
}

/**
 * Dinheiro livre = o menor saldo projetado no período (o "gargalo")
 * menos a reserva mínima e a margem de segurança. Gastar mais que isso hoje
 * faria o saldo ficar abaixo da reserva em algum dia do período.
 */
export function freeToSpend(t: TimelineResult, opts: FreeToSpendOptions): FreeToSpendResult {
  const bottleneck = Math.min(t.minBalance, t.startBalance);
  const free = bottleneck - opts.reserve - (opts.safetyMargin ?? 0);
  return {
    currentBalance: t.startBalance,
    projectedBalance: t.endBalance,
    lowestBalance: t.minBalance,
    lowestBalanceDate: t.minBalanceDate,
    freeToSpend: free as Cents,
    negativeAlert: t.firstNegativeDate !== null,
    firstNegativeDate: t.firstNegativeDate,
    belowReserveAlert: bottleneck < opts.reserve,
  };
}

export function horizonEndOfMonth(today: LocalDate): LocalDate {
  // último dia do mês corrente
  const [y, m] = today.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}
