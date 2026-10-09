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
});
