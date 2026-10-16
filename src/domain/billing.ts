/**
 * Cartões de crédito: ciclos de fatura, parcelas, pagamentos, estornos e limite.
 *
 * Convenções (documentadas em docs/REGRAS-FINANCEIRAS.md):
 * - Uma fatura é identificada pelo MÊS DO VENCIMENTO ("2026-10" vence em outubro).
 * - O fechamento pode cair no mesmo mês do vencimento ou no mês anterior.
 * - Compra NO dia do fechamento: por padrão vai para a PRÓXIMA fatura
 *   (comportamento da maioria dos emissores); configurável por cartão.
 * - Exceções pontuais de datas (feriado, emissor que antecipa) via `overrides`.
 * - Compras no crédito NUNCA geram lançamento em conta bancária. Só o
 *   pagamento da fatura movimenta a conta, e ele não é despesa de consumo.
 */
import { addMonthRef, clampedDate, compareDates, monthOf, parseMonth, type LocalDate, type MonthRef } from "./dates";
import { assertCents, splitEven, sum, type Cents } from "./money";

export type ClosingDayRule = "next_invoice" | "current_invoice";

export interface CardBillingConfig {
  closingDay: number; // 1..31 (limitado ao fim do mês)
  dueDay: number; // 1..31
  /** Meses entre o fechamento e o vencimento. Se omitido: 0 quando fechamento < vencimento, senão 1. */
  closingToDueMonths?: 0 | 1;
  closingDayRule?: ClosingDayRule;
  overrides?: Record<MonthRef, { closingDate?: LocalDate; dueDate?: LocalDate }>;
}

export function validateCardConfig(c: CardBillingConfig): void {
  for (const [k, v] of [
    ["closingDay", c.closingDay],
    ["dueDay", c.dueDay],
  ] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 31) throw new Error(`${k} deve estar entre 1 e 31`);
  }
}

function closingOffset(c: CardBillingConfig): 0 | 1 {
  return c.closingToDueMonths ?? (c.closingDay < c.dueDay ? 0 : 1);
}

export function dueDateOf(c: CardBillingConfig, ref: MonthRef): LocalDate {
  const o = c.overrides?.[ref]?.dueDate;
  if (o) return o;
  const { y, m } = parseMonth(ref);
  return clampedDate(y, m, c.dueDay);
}

export function closingDateOf(c: CardBillingConfig, ref: MonthRef): LocalDate {
  const o = c.overrides?.[ref]?.closingDate;
  if (o) return o;
  const { y, m } = parseMonth(addMonthRef(ref, -closingOffset(c)));
  return clampedDate(y, m, c.closingDay);
}

/** Período de compras da fatura: (fechamento anterior, fechamento] ajustado pela regra do dia. */
export function invoicePeriod(c: CardBillingConfig, ref: MonthRef) {
  return {
    ref,
    previousClosing: closingDateOf(c, addMonthRef(ref, -1)),
    closingDate: closingDateOf(c, ref),
    dueDate: dueDateOf(c, ref),
  };
}

/** Em qual fatura cai uma compra feita em `date`. */
export function invoiceRefForPurchase(c: CardBillingConfig, date: LocalDate): MonthRef {
  validateCardConfig(c);
  const rule = c.closingDayRule ?? "next_invoice";
  let ref = addMonthRef(monthOf(date), -1);
  for (let i = 0; i < 6; i++, ref = addMonthRef(ref, 1)) {
    const closing = closingDateOf(c, ref);
    const cmp = compareDates(date, closing);
    if (cmp < 0 || (cmp === 0 && rule === "current_invoice")) return ref;
  }
  throw new Error("Não foi possível determinar a fatura da compra");
}

// ---------------------------------------------------------------- compras

export type ChargeKind = "installment" | "refund" | "credit" | "adjustment" | "fee";

export interface CardCharge {
  id: string;
  cardId: string;
  purchaseId?: string;
  installmentNumber?: number;
  installmentCount?: number;
  invoiceRef: MonthRef;
  /** positivo = débito na fatura; negativo = crédito (estorno, crédito, ajuste) */
  amount: Cents;
  date: LocalDate;
  kind: ChargeKind;
  cancelled?: boolean;
  hypothetical?: boolean;
  /** categoria da compra (vem da compra, não da parcela) */
  categoryId?: string | null;
}

export interface CreditPurchaseInput {
  purchaseId: string;
  cardId: string;
  date: LocalDate;
  total: Cents;
  installments: number;
  /** Ajuste manual: força a primeira parcela numa fatura específica. */
  firstInvoiceRef?: MonthRef;
}

/** Gera as parcelas de uma compra, cada uma na fatura correta, somando exatamente o total. */
export function buildInstallments(c: CardBillingConfig, p: CreditPurchaseInput): CardCharge[] {
  assertCents(p.total);
  if (p.total <= 0) throw new Error("O valor da compra deve ser positivo");
  if (!Number.isInteger(p.installments) || p.installments < 1 || p.installments > 48) {
    throw new Error("Parcelas devem estar entre 1 e 48");
  }
  const first = p.firstInvoiceRef ?? invoiceRefForPurchase(c, p.date);
  return splitEven(p.total, p.installments).map((amount, i) => ({
    id: `${p.purchaseId}#${i + 1}`,
    cardId: p.cardId,
    purchaseId: p.purchaseId,
    installmentNumber: i + 1,
    installmentCount: p.installments,
    invoiceRef: addMonthRef(first, i),
    amount,
    date: p.date,
    kind: "installment" as const,
  }));
}

export type RefundMode =
  /** Credita o valor estornado na fatura atual; parcelas futuras continuam (padrão da maioria dos bancos). */
  | "credit_current"
  /** Cancela parcelas ainda não faturadas e credita só o que já foi faturado. */
  | "cancel_remaining";

/**
 * Estorno total ou parcial de uma compra.
 * Retorna os créditos a lançar e as parcelas a cancelar. A soma líquida
 * da compra após um estorno total é sempre exatamente zero.
 */
export function planRefund(
  c: CardBillingConfig,
  installments: readonly CardCharge[],
  refundDate: LocalDate,
  opts: { amount?: Cents; mode?: RefundMode; idPrefix: string },
): { credits: CardCharge[]; cancelIds: string[] } {
  const active = installments.filter((i) => !i.cancelled && i.kind === "installment");
  if (active.length === 0) throw new Error("Compra sem parcelas ativas");
  const total = sum(active.map((i) => i.amount));
  const amount = opts.amount ?? total;
  assertCents(amount);
  if (amount <= 0 || amount > total) throw new Error("Valor de estorno inválido");
  const ref = invoiceRefForPurchase(c, refundDate);
  const base = active[0];
  const mk = (value: Cents): CardCharge => ({
    id: `${opts.idPrefix}:refund`,
    cardId: base.cardId,
    purchaseId: base.purchaseId,
    invoiceRef: ref,
    amount: -value as Cents,
    date: refundDate,
    kind: "refund",
  });

  if ((opts.mode ?? "credit_current") === "credit_current" || amount !== total) {
    return { credits: [mk(amount)], cancelIds: [] };
  }
  // cancel_remaining (estorno total): parcelas em faturas a partir da fatura atual são canceladas
  const future = active.filter((i) => i.invoiceRef >= ref);
  const billed = active.filter((i) => i.invoiceRef < ref);
  const billedTotal = sum(billed.map((i) => i.amount));
  return {
    credits: billedTotal > 0 ? [mk(billedTotal)] : [],
    cancelIds: future.map((i) => i.id),
  };
}

// --------------------------------------------------------------- faturas

export interface CardPayment {
  id: string;
  cardId: string;
  invoiceRef: MonthRef;
  amount: Cents; // positivo
  date: LocalDate;
  accountId: string;
  status?: "confirmed" | "scheduled";
}

export type InvoiceStatus = "open" | "closed" | "paid" | "overdue" | "rolled_over" | "credit";

export interface InvoiceSummary {
  ref: MonthRef;
  closingDate: LocalDate;
  dueDate: LocalDate;
  /** soma dos lançamentos desta fatura (compras − créditos) */
  charges: Cents;
  /** saldo trazido da fatura anterior (crédito negativo, ou saldo devedor vencido) */
  carriedIn: Cents;
  total: Cents;
  paid: Cents;
  /** quanto ainda falta pagar (>= 0); excedente vira crédito na próxima */
  remaining: Cents;
  /** quanto foi levado para a próxima fatura */
  carriedOut: Cents;
  status: InvoiceStatus;
}

/**
 * Calcula todas as faturas de um cartão de `fromRef` a `toRef`.
 * Pagamentos só contam como confirmados. Pagamento a maior vira crédito na
 * fatura seguinte. Saldo não pago de fatura VENCIDA é levado à seguinte
 * (rotativo); juros entram como lançamento "fee" informado pelo usuário.
 */
export function computeInvoices(
  c: CardBillingConfig,
  charges: readonly CardCharge[],
  payments: readonly CardPayment[],
  today: LocalDate,
  range?: { fromRef?: MonthRef; toRef?: MonthRef },
): InvoiceSummary[] {
  const live = charges.filter((x) => !x.cancelled);
  const paidPayments = payments.filter((p) => (p.status ?? "confirmed") === "confirmed");
  const refs = [...live.map((x) => x.invoiceRef), ...paidPayments.map((p) => p.invoiceRef)].sort();
  const firstRef = range?.fromRef && (!refs[0] || range.fromRef < refs[0]) ? range.fromRef : refs[0];
  const lastRef = range?.toRef && (!refs.at(-1) || range.toRef > refs.at(-1)!) ? range.toRef : refs.at(-1);
  if (!firstRef || !lastRef) return [];

  const out: InvoiceSummary[] = [];
  let carry = 0;
  for (let ref = firstRef; ref <= lastRef; ref = addMonthRef(ref, 1)) {
    const { closingDate, dueDate } = invoicePeriod(c, ref);
    const ch = sum(live.filter((x) => x.invoiceRef === ref).map((x) => x.amount));
    const paid = sum(paidPayments.filter((p) => p.invoiceRef === ref).map((p) => p.amount));
    const total = ch + carry;
    const balance = total - paid;
    const isClosed = compareDates(today, closingDate) >= 0;
    const isPastDue = compareDates(today, dueDate) > 0;

    let remaining: number;
    let carriedOut: number;
    let status: InvoiceStatus;
    if (balance < 0) {
      remaining = 0;
      carriedOut = balance; // crédito para a próxima
      status = "credit";
    } else if (balance === 0) {
      remaining = 0;
      carriedOut = 0;
      status = total > 0 || paid > 0 ? "paid" : isClosed ? "closed" : "open";
    } else if (isPastDue) {
      remaining = 0;
      carriedOut = balance;
      status = "rolled_over";
    } else {
      remaining = balance;
      carriedOut = 0;
      status = isClosed ? "closed" : "open";
    }
    if (status === "rolled_over" && ref === lastRef) {
      // não há próxima fatura no intervalo para receber o saldo: continua devido e vencido
      remaining = balance;
      carriedOut = 0;
      status = "overdue";
    }
    out.push({
      ref,
      closingDate,
      dueDate,
      charges: ch,
      carriedIn: carry as Cents,
      total: total as Cents,
      paid,
      remaining: remaining as Cents,
      carriedOut: carriedOut as Cents,
      status,
    });
    carry = carriedOut;
  }
  if (range?.fromRef) return out.filter((i) => i.ref >= range.fromRef!);
  return out;
}

export type LimitRule = "full_amount" | "billed_only";

/**
 * Limite disponível.
 * - full_amount (padrão BR): a compra parcelada consome o limite pelo valor total;
 *   o limite é liberado conforme as faturas são pagas.
 * - billed_only: só consomem limite as parcelas de faturas já abertas/fechadas.
 */
export function availableLimit(
  c: CardBillingConfig,
  limit: Cents,
  charges: readonly CardCharge[],
  payments: readonly CardPayment[],
  today: LocalDate,
  rule: LimitRule = "full_amount",
): { used: Cents; available: Cents } {
  const currentRef = invoiceRefForPurchase(c, today);
  const live = charges.filter((x) => !x.cancelled && (rule === "full_amount" || x.invoiceRef <= currentRef));
  const paid = sum(payments.filter((p) => (p.status ?? "confirmed") === "confirmed").map((p) => p.amount));
  const used = sum(live.map((x) => x.amount)) - paid;
  return { used: used as Cents, available: (limit - used) as Cents };
}
