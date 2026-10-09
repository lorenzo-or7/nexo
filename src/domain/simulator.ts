/**
 * Simulador de compras: compara a projeção atual com a projeção "e se".
 * Trabalha sempre sobre cópias em memória — nada é persistido aqui.
 */
import { buildInstallments, computeInvoices, type CardCharge } from "./billing";
import { addMonthRef, monthOf, type LocalDate, type MonthRef } from "./dates";
import { type Cents } from "./money";
import { occurrences, type RecurrenceRule } from "./recurrence";
import { buildTimeline, freeToSpend, type TimelineInput, type TimelineResult } from "./timeline";

export type SimulatedItem =
  | { kind: "cash"; amount: Cents; date: LocalDate; accountId?: string; label?: string }
  | { kind: "credit"; amount: Cents; date: LocalDate; cardId: string; installments: number; label?: string }
  | {
      kind: "subscription";
      amount: Cents;
      rule: RecurrenceRule;
      cardId?: string; // cobrança no cartão; se ausente, débito em conta
      label?: string;
    };

export interface InvoiceImpact {
  cardId: string;
  ref: MonthRef;
  before: Cents;
  after: Cents;
  delta: Cents;
}

export interface SimulationResult {
  before: TimelineResult;
  after: TimelineResult;
  balanceBefore: Cents;
  balanceAfter: Cents;
  lowestBefore: Cents;
  lowestAfter: Cents;
  lowestAfterDate: LocalDate;
  invoiceImpact: InvoiceImpact[];
  monthlyImpact: { month: MonthRef; delta: Cents }[];
  freeBefore: Cents;
  freeAfter: Cents;
  alerts: string[];
}

export function simulate(
  base: TimelineInput,
  items: readonly SimulatedItem[],
  opts: { reserve: Cents; safetyMargin?: Cents },
): SimulationResult {
  const before = buildTimeline(base);
  const hypothetical: NonNullable<TimelineInput["hypothetical"]>[number][] = [...(base.hypothetical ?? [])];
  const extraCharges = new Map<string, CardCharge[]>();

  items.forEach((item, idx) => {
    const label = item.label ?? "Simulação";
    if (item.amount <= 0) throw new Error("Valor da simulação deve ser positivo");
    if (item.kind === "cash") {
      hypothetical.push({ date: item.date, amount: -item.amount as Cents, label, refId: `sim:${idx}` });
    } else if (item.kind === "credit") {
      const card = base.cards.find((c) => c.id === item.cardId);
      if (!card) throw new Error("Cartão não encontrado");
      const parts = buildInstallments(card.config, {
        purchaseId: `sim:${idx}`,
        cardId: card.id,
        date: item.date,
        total: item.amount,
        installments: item.installments,
      }).map((c) => ({ ...c, hypothetical: true }));
      extraCharges.set(card.id, [...(extraCharges.get(card.id) ?? []), ...parts]);
    } else {
      const dates = occurrences(item.rule, base.today, base.to);
      if (item.cardId) {
        const card = base.cards.find((c) => c.id === item.cardId);
        if (!card) throw new Error("Cartão não encontrado");
        const parts = dates.flatMap((d, j) =>
          buildInstallments(card.config, { purchaseId: `sim:${idx}:${j}`, cardId: card.id, date: d, total: item.amount, installments: 1 }),
        ).map((c) => ({ ...c, hypothetical: true }));
        extraCharges.set(card.id, [...(extraCharges.get(card.id) ?? []), ...parts]);
      } else {
        dates.forEach((d, j) => hypothetical.push({ date: d, amount: -item.amount as Cents, label, refId: `sim:${idx}:${j}` }));
      }
    }
  });

  const afterInput: TimelineInput = {
    ...base,
    hypothetical,
    cards: base.cards.map((c) => ({ ...c, charges: [...c.charges, ...(extraCharges.get(c.id) ?? [])] })),
  };
  const after = buildTimeline(afterInput);

  // impacto nas faturas
  const invoiceImpact: InvoiceImpact[] = [];
  for (const card of base.cards) {
    if (!extraCharges.has(card.id)) continue;
    const refs = extraCharges.get(card.id)!.map((c) => c.invoiceRef);
    const range = { fromRef: refs.reduce((a, b) => (a < b ? a : b)), toRef: refs.reduce((a, b) => (a > b ? a : b)) };
    const b = computeInvoices(card.config, card.charges, card.payments, base.today, range);
    const a = computeInvoices(card.config, afterInput.cards.find((c) => c.id === card.id)!.charges, card.payments, base.today, range);
    for (let ref = range.fromRef; ref <= range.toRef; ref = addMonthRef(ref, 1)) {
      const bt = b.find((i) => i.ref === ref)?.total ?? 0;
      const at = a.find((i) => i.ref === ref)?.total ?? 0;
      if (at !== bt) invoiceImpact.push({ cardId: card.id, ref, before: bt as Cents, after: at as Cents, delta: (at - bt) as Cents });
    }
  }

  // impacto mensal no caixa (saídas por mês de vencimento)
  const monthly = new Map<MonthRef, number>();
  const flowByMonth = (t: TimelineResult, sign: 1 | -1) => {
    for (const d of t.days) {
      const m = monthOf(d.date);
      monthly.set(m, (monthly.get(m) ?? 0) + sign * (d.inflow - d.outflow));
    }
  };
  flowByMonth(after, 1);
  flowByMonth(before, -1);
  const monthlyImpact = [...monthly.entries()]
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, delta]) => ({ month, delta: delta as Cents }));

  const fb = freeToSpend(before, opts);
  const fa = freeToSpend(after, opts);
  const alerts: string[] = [];
  if (after.firstNegativeDate) alerts.push(`Saldo projetado fica negativo a partir de ${after.firstNegativeDate}.`);
  else if (fa.belowReserveAlert) alerts.push("Saldo projetado fica abaixo da reserva mínima.");

  return {
    before,
    after,
    balanceBefore: before.endBalance,
    balanceAfter: after.endBalance,
    lowestBefore: before.minBalance,
    lowestAfter: after.minBalance,
    lowestAfterDate: after.minBalanceDate,
    invoiceImpact,
    monthlyImpact,
    freeBefore: fb.freeToSpend,
    freeAfter: fa.freeToSpend,
    alerts,
  };
}
