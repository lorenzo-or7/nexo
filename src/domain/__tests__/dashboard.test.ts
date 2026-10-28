import { describe, expect, it } from "vitest";
import { buildDashboard } from "../dashboard";
import { demoScenario } from "../demo";
import type { Cents } from "../money";

const input = () => ({
  base: demoScenario({ balanceAccountName: "Conta" }),
  accounts: [{ id: "acc-main", name: "Conta", institution: null, color: "#C20F49", isDemo: true }],
  cards: [
    { id: "card-santander", name: "Santander", institution: "Santander", brand: "visa", lastFour: null, color: "#C20F49", limit: 200000 as Cents },
    { id: "card-nubank", name: "Nubank", institution: "Nubank", brand: "mastercard", lastFour: null, color: "#241127", limit: 300000 as Cents },
  ],
  categories: [],
  reserve: 0 as Cents,
  safetyMargin: 0 as Cents,
  horizon: "month" as const,
});

describe("dashboard derivado dos dados", () => {
  it("separa saldo real, a receber, a pagar e projetado", () => {
    const d = buildDashboard(input());
    expect(d.totals.bankBalance).toBe(32112);
    expect(d.totals.toReceive).toBe(81268 + 48899);
    expect(d.totals.toPay).toBe(54468 + 81488);
    expect(d.totals.projected).toBe(26323);
    expect(d.totals.monthIncome).toBe(0); // previstos não são receita realizada
    expect(d.accounts[0].balance).toBe(32112);
    expect(d.cards.map((c) => [c.name, c.currentInvoice, c.currentDue])).toEqual([
      ["Santander", 54468, "2026-10-10"],
      ["Nubank", 81488, "2026-10-20"],
    ]);
    expect(d.totals.closedUnpaid).toBe(54468); // Santander fechou dia 03
    expect(d.totals.openInvoices).toBe(81488); // Nubank fecha dia 13
    expect(d.series.at(-1)!.balance).toBeCloseTo(263.23);
  });

  it("separa o gráfico com e sem receitas previstas", () => {
    const d = buildDashboard(input());
    const last = d.chart.days.at(-1)!;
    // com previstas: termina no saldo projetado; só confirmado: sem os recebimentos previstos
    expect(last.balanceAll).toBeCloseTo(263.23);
    expect(last.balanceConfirmed).toBeCloseTo(263.23 - (812.68 + 488.99));
    expect(d.chart.days.reduce((t, x) => t + x.incomeExpected, 0)).toBeCloseTo(812.68 + 488.99);
    expect(d.chart.expectedIncome.map((e) => e.amount)).toEqual([81268, 48899]);
    expect(d.chart.days.reduce((t, x) => t + x.incomeConfirmed, 0)).toBe(0);
  });

  it("agrupa compras no cartão pela categoria da compra", () => {
    const i = { ...input(), categories: [{ id: "cat-a", name: "Alimentação", parentId: null as string | null, color: "#2F9E44" }] };
    const today = i.base.today;
    i.base.cards[0].charges = [
      ...i.base.cards[0].charges,
      { id: "ch-x", cardId: i.base.cards[0].id, invoiceRef: today.slice(0, 7), amount: 4000 as Cents, date: today, kind: "installment", purchaseId: "p1", installmentNumber: 1, installmentCount: 1, categoryId: "cat-a" },
    ];
    const d = buildDashboard(i);
    const food = d.byCategory.find((c) => c.name === "Alimentação");
    expect(food?.amount).toBe(4000);
    expect(food?.color).toBe("#2F9E44");
  });

  it("destaque nos dois cenários: só o confirmado e com as receitas previstas", () => {
    const d = buildDashboard(input());
    const { confirmed, withExpected } = d.scenarios;
    // com previstas: é o cenário "normal" da demonstração
    expect(withExpected.projected).toBe(26323);
    expect(withExpected.expectedIncome).toBe(81268 + 48899);
    expect(withExpected.firstNegativeDate).toBeNull();
    // só o confirmado: tira exatamente os recebimentos previstos e o saldo fica negativo
    expect(confirmed.projected).toBe(26323 - (81268 + 48899));
    expect(confirmed.expectedIncome).toBe(0);
    expect(confirmed.firstNegativeDate).not.toBeNull();
    expect(confirmed.free).toBeLessThan(withExpected.free);
    // o menor saldo nunca passa do saldo do último dia no cenário com previstas (nada entra depois)
    expect(withExpected.lowest).toBeLessThanOrEqual(withExpected.projected);
  });

  it("reserva e margem de segurança descontam nos dois cenários", () => {
    const base = buildDashboard(input());
    const withReserve = buildDashboard({ ...input(), reserve: 10000 as Cents, safetyMargin: 5000 as Cents });
    expect(withReserve.scenarios.withExpected.free).toBe(base.scenarios.withExpected.free - 15000);
    expect(withReserve.scenarios.confirmed.free).toBe(base.scenarios.confirmed.free - 15000);
  });

  it("separa as saídas do dia por origem (faturas, contas fixas e assinaturas, outras)", () => {
    const i = input();
    const today = i.base.today;
    i.base.entries = [
      ...i.base.entries,
      // conta fixa/assinatura paga em conta: o id segue o padrão sub:<id>:<período>
      { id: `sub:abc:${today.slice(0, 7)}`, accountId: i.base.accounts[0].id, date: today.slice(0, 8) + "28", amount: -21050 as Cents, kind: "expense", status: "scheduled", description: "Conta de luz", categoryId: null },
      { id: "e-outra", accountId: i.base.accounts[0].id, date: today.slice(0, 8) + "29", amount: -5000 as Cents, kind: "expense", status: "scheduled", description: "Dentista", categoryId: null },
    ];
    const d = buildDashboard(i);
    const sum = (f: (x: (typeof d.chart.days)[number]) => number) => d.chart.days.reduce((t, x) => t + f(x), 0);
    expect(sum((x) => x.outRecurring)).toBeCloseTo(210.5);
    expect(sum((x) => x.outOther)).toBeCloseTo(50);
    expect(sum((x) => x.outInvoices)).toBeCloseTo(544.68 + 814.88);
    // as três partes sempre somam o total de saídas do dia
    for (const x of d.chart.days) expect(x.outInvoices + x.outRecurring + x.outOther).toBeCloseTo(x.expenses);
  });

  it("A receber não zera quando o ajuste de receitas previstas está desligado", () => {
    const on = buildDashboard(input());
    const off = input();
    off.base = { ...off.base, includeExpectedIncome: false };
    const d = buildDashboard(off);
    expect(d.totals.toReceive).toBe(on.totals.toReceive);
    expect(d.totals.toReceive).toBe(81268 + 48899);
  });

  it("A receber e A pagar ignoram transferências entre contas", () => {
    const i = input();
    const today = i.base.today;
    i.base.entries = [
      ...i.base.entries,
      { id: "t1", accountId: i.base.accounts[0].id, date: today.slice(0, 8) + "28", amount: 10000 as Cents, kind: "transfer", status: "scheduled", description: "Transf", categoryId: null },
    ];
    const d = buildDashboard(i);
    expect(d.totals.toReceive).toBe(81268 + 48899);
  });

  it("Faturas abertas conta só a fatura aberta atual de cada cartão (parcelas futuras à parte)", () => {
    const i = input();
    const c = i.base.cards.find((x) => x.id === "card-nubank")!;
    c.charges = [
      ...c.charges,
      { id: "fut", cardId: c.id, invoiceRef: "2027-03", amount: 99900 as Cents, date: i.base.today, kind: "installment", purchaseId: "pf", installmentNumber: 1, installmentCount: 1 },
    ];
    const d = buildDashboard(i);
    expect(d.totals.openInvoices).toBe(81488);
    expect(d.totals.futureInvoices).toBeGreaterThanOrEqual(99900);
  });

  it("detalhamento fecha exatamente com os indicadores principais", () => {
    const d = buildDashboard(input());
    const t = d.totals;
    const sumItems = (l: { amount: number }[]) => l.reduce((a, x) => a + x.amount, 0);
    expect(sumItems(d.details.receivables)).toBe(t.toReceive);
    expect(-sumItems(d.details.payables)).toBe(t.toPay);
    expect(sumItems(d.details.openInvoices.map((x) => ({ amount: x.remaining })))).toBe(t.openInvoices);
    expect(sumItems(d.details.futureInvoices.map((x) => ({ amount: x.remaining })))).toBe(t.futureInvoices);
    expect(sumItems(d.details.closedInvoices.map((x) => ({ amount: x.remaining })))).toBe(t.closedUnpaid);
    expect(sumItems(d.accounts.map((a) => ({ amount: a.balance })))).toBe(t.bankBalance);
    for (const [k, sc] of [["confirmed", d.scenarios.confirmed], ["withExpected", d.scenarios.withExpected]] as const) {
      const c = d.details.composition[k];
      expect(c.startBalance + sumItems(c.rows)).toBe(c.endBalance);
      expect(c.endBalance).toBe(sc.projected);
      expect(c.free).toBe(sc.free);
      expect(c.lowest).toBe(sc.lowest);
      expect(Math.min(...c.series.map((x) => x.balance))).toBe(c.lowest);
    }
  });
});
