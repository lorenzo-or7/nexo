/**
 * Contas bancárias e lançamentos.
 *
 * Saldo REAL de uma conta = saldo inicial (no início da data de referência)
 * + lançamentos com status "confirmed" com data >= data de referência e <= data consultada.
 * Lançamentos "scheduled" (agendados/confirmados pela outra parte) e "expected"
 * (previstos) nunca entram no saldo real — só na projeção.
 */
import type { CardCharge } from "./billing";
import { compareDates, type LocalDate } from "./dates";
import { assertCents, sum, type Cents } from "./money";

export type EntryKind =
  | "income"
  | "expense"
  | "transfer"
  | "invoice_payment"
  | "refund"
  | "adjustment";

/** confirmed = realizado; scheduled = agendado/confirmado; expected = previsto (incerto) */
export type EntryStatus = "confirmed" | "scheduled" | "expected";

export interface Account {
  id: string;
  name: string;
  openingBalance: Cents;
  openingDate: LocalDate;
  archived?: boolean;
}

export interface AccountEntry {
  id: string;
  accountId: string;
  date: LocalDate;
  /** com sinal: positivo entra na conta, negativo sai */
  amount: Cents;
  kind: EntryKind;
  status: EntryStatus;
  description?: string;
  categoryId?: string | null;
  transferId?: string;
  cardId?: string;
  invoiceRef?: string;
  hypothetical?: boolean;
}

export function validateEntry(e: AccountEntry): void {
  assertCents(e.amount);
  if (e.amount === 0) throw new Error("Lançamento com valor zero");
  const sign = Math.sign(e.amount);
  if ((e.kind === "income" || e.kind === "refund") && sign < 0) throw new Error(`${e.kind} deve ser positivo`);
  if ((e.kind === "expense" || e.kind === "invoice_payment") && sign > 0) throw new Error(`${e.kind} deve ser negativo`);
  if (e.kind === "transfer" && !e.transferId) throw new Error("Transferência sem identificador");
  if (e.kind === "invoice_payment" && (!e.cardId || !e.invoiceRef)) throw new Error("Pagamento sem fatura");
}

export function accountBalance(account: Account, entries: readonly AccountEntry[], asOf: LocalDate): Cents {
  if (compareDates(asOf, account.openingDate) < 0) {
    throw new Error("Data anterior à data de referência do saldo inicial");
  }
  const own = entries.filter(
    (e) =>
      e.accountId === account.id &&
      e.status === "confirmed" &&
      !e.hypothetical &&
      e.date >= account.openingDate &&
      e.date <= asOf,
  );
  return sum([account.openingBalance, ...own.map((e) => e.amount)]);
}

export function consolidatedBalance(accounts: readonly Account[], entries: readonly AccountEntry[], asOf: LocalDate): Cents {
  return sum(
    accounts.filter((a) => a.openingDate <= asOf).map((a) => accountBalance(a, entries, asOf)),
  );
}

/**
 * Cria os dois lados de uma transferência. No banco isso é feito por uma
 * função SQL numa única transação (ver migration `create_transfer`).
 */
export function buildTransfer(input: {
  transferId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: Cents;
  date: LocalDate;
  status?: EntryStatus;
  description?: string;
}): [AccountEntry, AccountEntry] {
  assertCents(input.amount);
  if (input.amount <= 0) throw new Error("O valor da transferência deve ser positivo");
  if (input.fromAccountId === input.toAccountId) throw new Error("Escolha contas diferentes");
  const base = {
    date: input.date,
    kind: "transfer" as const,
    status: input.status ?? "confirmed",
    transferId: input.transferId,
    description: input.description,
  };
  return [
    { ...base, id: `${input.transferId}:out`, accountId: input.fromAccountId, amount: -input.amount as Cents },
    { ...base, id: `${input.transferId}:in`, accountId: input.toAccountId, amount: input.amount },
  ];
}

// ------------------------------------------------------ análise de consumo

export interface SpendingLine {
  categoryId: string | null;
  amount: Cents; // positivo = gasto
  source: "account" | "card";
  date: LocalDate;
  accountOrCardId: string;
}

/**
 * Linhas de CONSUMO no período (regime de competência da compra).
 * - Despesas em conta contam; reembolsos e estornos reduzem.
 * - Compras no cartão contam pela data da compra (todas as parcelas).
 * - Pagamentos de fatura e transferências NUNCA contam (seriam dupla contagem).
 */
export function spendingLines(
  entries: readonly AccountEntry[],
  charges: readonly (CardCharge & { categoryId?: string | null })[],
  from: LocalDate,
  to: LocalDate,
): SpendingLine[] {
  const inRange = (d: LocalDate) => d >= from && d <= to;
  const lines: SpendingLine[] = [];
  for (const e of entries) {
    if (e.status !== "confirmed" || e.hypothetical || !inRange(e.date)) continue;
    if (e.kind === "expense") lines.push({ categoryId: e.categoryId ?? null, amount: -e.amount as Cents, source: "account", date: e.date, accountOrCardId: e.accountId });
    if (e.kind === "refund") lines.push({ categoryId: e.categoryId ?? null, amount: -e.amount as Cents, source: "account", date: e.date, accountOrCardId: e.accountId });
  }
  for (const c of charges) {
    if (c.cancelled || c.hypothetical || !inRange(c.date)) continue;
    if (c.kind === "installment" || c.kind === "refund" || c.kind === "fee") {
      lines.push({ categoryId: c.categoryId ?? null, amount: c.amount, source: "card", date: c.date, accountOrCardId: c.cardId });
    }
  }
  return lines;
}

export function totalsByCategory(lines: readonly SpendingLine[]): Map<string | null, Cents> {
  const m = new Map<string | null, Cents>();
  for (const l of lines) m.set(l.categoryId, ((m.get(l.categoryId) ?? 0) + l.amount) as Cents);
  return m;
}

export function incomeTotal(entries: readonly AccountEntry[], from: LocalDate, to: LocalDate): Cents {
  return sum(
    entries
      .filter((e) => e.kind === "income" && e.status === "confirmed" && !e.hypothetical && e.date >= from && e.date <= to)
      .map((e) => e.amount),
  );
}
