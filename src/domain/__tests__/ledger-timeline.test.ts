import { describe, expect, it } from "vitest";
import { buildInstallments } from "../billing";
import { demoScenario } from "../demo";
import {
  accountBalance,
  buildTransfer,
  consolidatedBalance,
  spendingLines,
  validateEntry,
  type Account,
  type AccountEntry,
} from "../ledger";
import { sum, type Cents } from "../money";
import { simulate } from "../simulator";
import { buildTimeline, freeToSpend, type TimelineInput } from "../timeline";

const nu: Account = { id: "nu", name: "Nubank", openingBalance: 100000, openingDate: "2026-10-01" };
const st: Account = { id: "st", name: "Santander", openingBalance: 50000, openingDate: "2026-10-01" };

describe("[1] compra no crédito não reduz o saldo bancário", () => {
  it("saldo da conta permanece igual após a compra; só cai quando a fatura é paga", () => {
    const purchase = buildInstallments({ closingDay: 13, dueDay: 20 }, { purchaseId: "p", cardId: "card", date: "2026-10-05", total: 15000, installments: 1 });
    // a compra não gera nenhum AccountEntry
    const entries: AccountEntry[] = [];
    expect(accountBalance(nu, entries, "2026-10-05")).toBe(100000);
    expect(purchase[0].invoiceRef).toBe("2026-10");

    const payment: AccountEntry = { id: "pay", accountId: "nu", date: "2026-10-20", amount: -15000, kind: "invoice_payment", status: "confirmed", cardId: "card", invoiceRef: "2026-10" };
    expect(accountBalance(nu, [payment], "2026-10-19")).toBe(100000);
    expect(accountBalance(nu, [payment], "2026-10-20")).toBe(85000);
  });

  it("pagamento de fatura não é contado como segunda despesa no consumo", () => {
    const purchase = buildInstallments({ closingDay: 13, dueDay: 20 }, { purchaseId: "p", cardId: "card", date: "2026-10-05", total: 15000, installments: 1 });
    const payment: AccountEntry = { id: "pay", accountId: "nu", date: "2026-10-20", amount: -15000, kind: "invoice_payment", status: "confirmed", cardId: "card", invoiceRef: "2026-10" };
    const lines = spendingLines([payment], purchase, "2026-10-01", "2026-10-31");
    expect(sum(lines.map((l) => l.amount))).toBe(15000); // apenas a compra
  });
});

describe("[5] transferência entre contas", () => {
  it("move o valor sem alterar o saldo consolidado nem contar como receita/despesa", () => {
    const t = buildTransfer({ transferId: "t1", fromAccountId: "nu", toAccountId: "st", amount: 10000, date: "2026-10-02" });
    expect(accountBalance(nu, t, "2026-10-02")).toBe(90000);
    expect(accountBalance(st, t, "2026-10-02")).toBe(60000);
    expect(consolidatedBalance([nu, st], t, "2026-10-02")).toBe(consolidatedBalance([nu, st], [], "2026-10-02"));
    expect(spendingLines(t, [], "2026-10-01", "2026-10-31")).toEqual([]);
    expect(t[0].transferId).toBe(t[1].transferId);
  });
  it("não permite transferir para a mesma conta ou valor não positivo", () => {
    expect(() => buildTransfer({ transferId: "x", fromAccountId: "nu", toAccountId: "nu", amount: 1, date: "2026-10-02" })).toThrow();
    expect(() => buildTransfer({ transferId: "x", fromAccountId: "nu", toAccountId: "st", amount: 0, date: "2026-10-02" })).toThrow();
  });
});

describe("[11] edição de transação já registrada", () => {
  it("recalcular após editar valor e data reflete apenas a versão nova", () => {
    const original: AccountEntry = { id: "e1", accountId: "nu", date: "2026-10-03", amount: -2000, kind: "expense", status: "confirmed" };
    const edited: AccountEntry = { ...original, amount: -3550, date: "2026-10-04" };
    expect(accountBalance(nu, [original], "2026-10-05")).toBe(98000);
    expect(accountBalance(nu, [edited], "2026-10-03")).toBe(100000);
    expect(accountBalance(nu, [edited], "2026-10-05")).toBe(96450);
  });
  it("validação rejeita sinais incoerentes", () => {
    expect(() => validateEntry({ id: "x", accountId: "nu", date: "2026-10-03", amount: 100, kind: "expense", status: "confirmed" })).toThrow();
    expect(() => validateEntry({ id: "x", accountId: "nu", date: "2026-10-03", amount: -100, kind: "income", status: "confirmed" })).toThrow();
    expect(() => validateEntry({ id: "x", accountId: "nu", date: "2026-10-03", amount: 0, kind: "income", status: "confirmed" })).toThrow();
  });
});

describe("cenário demonstrativo (seção 11 e 18)", () => {
  it("R$ 321,12 + 812,68 − 544,68 + 488,99 − 814,88 = R$ 263,23", () => {
    const t = buildTimeline(demoScenario({ balanceAccountName: "Conta escolhida" }));
    expect(t.startBalance).toBe(32112);
    expect(t.endBalance).toBe(26323);
    const moves = t.events.map((e) => [e.date, e.amount]);
    expect(moves).toEqual([
      ["2026-10-09", 81268],
      ["2026-10-10", -54468],
      ["2026-10-19", 48899],
      ["2026-10-20", -81488],
    ]);
    const day = (d: string) => t.days.find((x) => x.date === d)!.closing;
    expect(day("2026-10-09")).toBe(113380);
    expect(day("2026-10-10")).toBe(58912);
    expect(day("2026-10-19")).toBe(107811);
    expect(day("2026-10-20")).toBe(26323);
    expect(t.firstNegativeDate).toBeNull();
  });
});

describe("[12] recebimento previsto versus confirmado", () => {
  const base = (): TimelineInput => demoScenario({ balanceAccountName: "X" });

  it("recebimento previsto não entra no saldo real", () => {
    const input = base();
    expect(consolidatedBalance(input.accounts, input.entries, "2026-10-10")).toBe(32112);
  });
  it("ao confirmar, passa a contar no saldo real", () => {
    const input = base();
    const confirmed = input.entries.map((e) => (e.id === "inc-1" ? { ...e, status: "confirmed" as const } : e));
    expect(consolidatedBalance(input.accounts, confirmed, "2026-10-09")).toBe(32112 + 81268);
    expect(consolidatedBalance(input.accounts, confirmed, "2026-10-08")).toBe(32112);
  });
  it("usuário pode excluir receitas não confirmadas da projeção", () => {
    const t = buildTimeline({ ...base(), includeExpectedIncome: false });
    expect(t.events.every((e) => e.amount < 0)).toBe(true);
    expect(t.endBalance).toBe(32112 - 54468 - 81488);
  });
  it("status: previsto, confirmado e atrasado são distinguidos", () => {
    const input = base();
    input.entries = [
      ...input.entries,
      { id: "late", accountId: "acc-main", date: "2026-10-05", amount: -1000, kind: "expense", status: "scheduled", description: "Conta de luz" },
      { id: "sched", accountId: "acc-main", date: "2026-10-15", amount: 5000, kind: "income", status: "scheduled", description: "Pix agendado" },
    ];
    const t = buildTimeline(input);
    const st = (id: string) => t.events.find((e) => e.refId === id)!;
    expect(st("inc-1").status).toBe("expected");
    expect(st("sched").status).toBe("confirmed");
    expect(st("late").status).toBe("late");
    expect(st("late").date).toBe("2026-10-08");
    expect(st("late").originalDate).toBe("2026-10-05");
  });
});

describe("[13] saldo negativo intermediário", () => {
  it("alerta mesmo quando o saldo final é positivo", () => {
    const input = demoScenario({ balanceAccountName: "X" });
    // recebimento do dia 09 atrasa para o dia 11: no dia 10 a fatura deixa o saldo negativo
    input.entries = input.entries.map((e) => (e.id === "inc-1" ? { ...e, date: "2026-10-11" } : e));
    const t = buildTimeline(input);
    expect(t.endBalance).toBe(26323);
    expect(t.firstNegativeDate).toBe("2026-10-10");
    expect(t.minBalance).toBe(32112 - 54468);
    const f = freeToSpend(t, { reserve: 0 });
    expect(f.negativeAlert).toBe(true);
    expect(f.freeToSpend).toBe(32112 - 54468);
    expect(f.projectedBalance).toBe(26323);
  });
});

describe("quanto posso gastar", () => {
  it("considera o gargalo do período, reserva mínima e margem", () => {
    const t = buildTimeline(demoScenario({ balanceAccountName: "X" }));
    // menor saldo: hoje, R$ 321,12 (antes de qualquer movimento)
    const f = freeToSpend(t, { reserve: 10000, safetyMargin: 2000 });
    expect(f.currentBalance).toBe(32112);
    expect(f.lowestBalance).toBe(26323);
    expect(f.freeToSpend).toBe(26323 - 10000 - 2000);
  });
});

describe("simulador", () => {
  it("compra hipotética não altera os dados reais e mostra impacto", () => {
    const input = demoScenario({ balanceAccountName: "X" });
    const snapshot = JSON.stringify(input);
    const r = simulate(input, [{ kind: "cash", amount: 15000 as Cents, date: "2026-10-08", label: "Posso gastar R$ 150 hoje?" }], { reserve: 0 });
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(r.balanceBefore).toBe(26323);
    expect(r.balanceAfter).toBe(11323);
    expect(r.after.events.find((e) => e.source === "simulation")!.status).toBe("hypothetical");
    expect(r.alerts).toEqual([]);
  });

  it("à vista × parcelado no cartão: impacto por fatura e por mês", () => {
    const input = demoScenario({ balanceAccountName: "X" });
    input.to = "2027-01-31";
    const r = simulate(input, [{ kind: "credit", amount: 30000 as Cents, date: "2026-10-08", cardId: "card-nubank", installments: 3 }], { reserve: 0 });
    expect(r.invoiceImpact.map((i) => [i.ref, i.delta])).toEqual([["2026-10", 10000], ["2026-11", 10000], ["2026-12", 10000]]);
    expect(r.monthlyImpact.map((m) => [m.month, m.delta])).toEqual([["2026-10", -10000], ["2026-11", -10000], ["2026-12", -10000]]);
  });

  it("alerta de insuficiência", () => {
    const input = demoScenario({ balanceAccountName: "X" });
    const r = simulate(input, [{ kind: "cash", amount: 40000 as Cents, date: "2026-10-08" }], { reserve: 0 });
    expect(r.alerts[0]).toMatch(/negativo/);
    expect(r.lowestAfter).toBeLessThan(0);
  });

  it("nova assinatura nos próximos seis meses", () => {
    const input = demoScenario({ balanceAccountName: "X" });
    input.to = "2027-04-08";
    const r = simulate(input, [{ kind: "subscription", amount: 11000 as Cents, rule: { frequency: "monthly", interval: 1, startDate: "2026-10-15" } }], { reserve: 0 });
    expect(r.balanceBefore - r.balanceAfter).toBe(6 * 11000);
  });
});
