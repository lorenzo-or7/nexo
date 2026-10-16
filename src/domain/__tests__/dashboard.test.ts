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
});
