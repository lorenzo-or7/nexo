import { describe, expect, it } from "vitest";
import {
  availableLimit,
  buildInstallments,
  closingDateOf,
  computeInvoices,
  dueDateOf,
  invoiceRefForPurchase,
  planRefund,
  type CardBillingConfig,
  type CardCharge,
  type CardPayment,
} from "../billing";
import { sum } from "../money";

const nubank: CardBillingConfig = { closingDay: 13, dueDay: 20 }; // fecha e vence no mesmo mês
const lateClose: CardBillingConfig = { closingDay: 28, dueDay: 5 }; // fecha num mês, vence no seguinte

describe("ciclo de faturamento", () => {
  it("fecha e vence no mesmo mês quando fechamento < vencimento", () => {
    expect(closingDateOf(nubank, "2026-10")).toBe("2026-10-13");
    expect(dueDateOf(nubank, "2026-10")).toBe("2026-10-20");
    expect(invoiceRefForPurchase(nubank, "2026-10-12")).toBe("2026-10");
    expect(invoiceRefForPurchase(nubank, "2026-10-14")).toBe("2026-11");
  });

  it("não presume o mesmo mês: fecha dia 28 e vence dia 5 do mês seguinte", () => {
    expect(closingDateOf(lateClose, "2026-11")).toBe("2026-10-28");
    expect(dueDateOf(lateClose, "2026-11")).toBe("2026-11-05");
    expect(invoiceRefForPurchase(lateClose, "2026-10-27")).toBe("2026-11");
    expect(invoiceRefForPurchase(lateClose, "2026-10-29")).toBe("2026-12");
  });

  describe("[7] compra no dia do fechamento", () => {
    it("padrão: entra na PRÓXIMA fatura", () => {
      expect(invoiceRefForPurchase(nubank, "2026-10-13")).toBe("2026-11");
    });
    it("configurável: entra na fatura ATUAL", () => {
      expect(invoiceRefForPurchase({ ...nubank, closingDayRule: "current_invoice" }, "2026-10-13")).toBe("2026-10");
    });
    it("um dia antes e um dia depois do fechamento", () => {
      expect(invoiceRefForPurchase(nubank, "2026-10-12")).toBe("2026-10");
      expect(invoiceRefForPurchase(nubank, "2026-10-14")).toBe("2026-11");
    });
  });

  describe("[8] ciclos que atravessam o fim do ano", () => {
    it("compra em dezembro após o fechamento vai para a fatura de janeiro do ano seguinte", () => {
      expect(invoiceRefForPurchase(nubank, "2026-12-20")).toBe("2027-01");
      expect(dueDateOf(nubank, "2027-01")).toBe("2027-01-20");
    });
    it("fatura de janeiro fecha em dezembro do ano anterior", () => {
      expect(closingDateOf(lateClose, "2027-01")).toBe("2026-12-28");
      expect(invoiceRefForPurchase(lateClose, "2026-12-29")).toBe("2027-02");
    });
    it("parcelamento de 3x a partir de novembro cruza o ano", () => {
      const p = buildInstallments(nubank, { purchaseId: "p", cardId: "c", date: "2026-11-20", total: 30000, installments: 3 });
      expect(p.map((x) => x.invoiceRef)).toEqual(["2026-12", "2027-01", "2027-02"]);
    });
  });

  describe("[9] meses com 28, 29, 30 e 31 dias", () => {
    const day31: CardBillingConfig = { closingDay: 31, dueDay: 10 };
    it("fechamento dia 31 vira o último dia do mês", () => {
      expect(closingDateOf(day31, "2026-03")).toBe("2026-02-28"); // 28 dias
      expect(closingDateOf(day31, "2028-03")).toBe("2028-02-29"); // bissexto, 29 dias
      expect(closingDateOf(day31, "2026-05")).toBe("2026-04-30"); // 30 dias
      expect(closingDateOf(day31, "2026-02")).toBe("2026-01-31"); // 31 dias
    });
    it("vencimento dia 31 em fevereiro e abril", () => {
      const due31: CardBillingConfig = { closingDay: 24, dueDay: 31 };
      expect(dueDateOf(due31, "2026-02")).toBe("2026-02-28");
      expect(dueDateOf(due31, "2028-02")).toBe("2028-02-29");
      expect(dueDateOf(due31, "2026-04")).toBe("2026-04-30");
      expect(dueDateOf(due31, "2026-01")).toBe("2026-01-31");
    });
    it("compra em 29/02 de ano bissexto e no último dia de cada mês", () => {
      expect(invoiceRefForPurchase(day31, "2028-02-29")).toBe("2028-04"); // fechamento 29/02 → próxima
      expect(invoiceRefForPurchase(day31, "2028-02-28")).toBe("2028-03");
      expect(invoiceRefForPurchase(day31, "2026-04-30")).toBe("2026-06");
      expect(invoiceRefForPurchase(day31, "2026-04-29")).toBe("2026-05");
    });
  });

  it("exceção manual de datas para uma fatura específica", () => {
    const c: CardBillingConfig = { ...nubank, overrides: { "2026-12": { closingDate: "2026-12-11", dueDate: "2026-12-18" } } };
    expect(invoiceRefForPurchase(c, "2026-12-12")).toBe("2027-01");
    expect(dueDateOf(c, "2026-12")).toBe("2026-12-18");
  });

  it("ajuste manual: força a primeira parcela numa fatura", () => {
    const p = buildInstallments(nubank, { purchaseId: "p", cardId: "c", date: "2026-10-12", total: 1000, installments: 2, firstInvoiceRef: "2026-11" });
    expect(p.map((x) => x.invoiceRef)).toEqual(["2026-11", "2026-12"]);
  });
});

describe("[2] compra parcelada em duas ou mais faturas", () => {
  it("R$ 85 em 2x = 2 × R$ 42,50 em faturas consecutivas", () => {
    const p = buildInstallments(nubank, { purchaseId: "p1", cardId: "nu", date: "2026-10-05", total: 8500, installments: 2 });
    expect(p.map((x) => x.amount)).toEqual([4250, 4250]);
    expect(p.map((x) => x.invoiceRef)).toEqual(["2026-10", "2026-11"]);
    expect(p.every((x) => x.purchaseId === "p1")).toBe(true);
    expect(p.map((x) => `${x.installmentNumber}/${x.installmentCount}`)).toEqual(["1/2", "2/2"]);
    expect(sum(p.map((x) => x.amount))).toBe(8500);
  });
  it("R$ 100 em 3x soma exatamente R$ 100", () => {
    const p = buildInstallments(nubank, { purchaseId: "p2", cardId: "nu", date: "2026-10-05", total: 10000, installments: 3 });
    expect(p.map((x) => x.amount)).toEqual([3334, 3333, 3333]);
    expect(p.map((x) => x.invoiceRef)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
  it("cada fatura recebe só sua parcela", () => {
    const p = buildInstallments(nubank, { purchaseId: "p", cardId: "nu", date: "2026-10-05", total: 8500, installments: 2 });
    const inv = computeInvoices(nubank, p, [], "2026-10-08");
    expect(inv.map((i) => [i.ref, i.total])).toEqual([["2026-10", 4250], ["2026-11", 4250]]);
  });
});

function charge(ref: string, amount: number, id = `c-${ref}-${amount}`): CardCharge {
  return { id, cardId: "nu", invoiceRef: ref, amount, date: "2026-10-01", kind: "installment" };
}
function pay(ref: string, amount: number, date = "2026-10-19"): CardPayment {
  return { id: `p-${ref}-${amount}`, cardId: "nu", invoiceRef: ref, amount, date, accountId: "acc" };
}

describe("[3] pagamento integral de fatura", () => {
  it("zera o restante e marca como paga", () => {
    const [inv] = computeInvoices(nubank, [charge("2026-10", 81488)], [pay("2026-10", 81488)], "2026-10-19");
    expect(inv.remaining).toBe(0);
    expect(inv.status).toBe("paid");
  });
  it("pagamento antecipado (fatura ainda aberta) também quita", () => {
    const [inv] = computeInvoices(nubank, [charge("2026-10", 5000)], [pay("2026-10", 5000, "2026-10-02")], "2026-10-02");
    expect(inv.remaining).toBe(0);
    expect(inv.status).toBe("paid");
  });
});

describe("[4] pagamento parcial de fatura", () => {
  it("restante continua devido até o vencimento", () => {
    const [inv] = computeInvoices(nubank, [charge("2026-10", 81488)], [pay("2026-10", 30000)], "2026-10-19");
    expect(inv.remaining).toBe(51488);
    expect(inv.status).toBe("closed");
  });
  it("após o vencimento, o saldo não pago é levado para a próxima fatura (sem duplicar)", () => {
    const inv = computeInvoices(nubank, [charge("2026-10", 81488), charge("2026-11", 10000)], [pay("2026-10", 30000)], "2026-10-25");
    expect(inv[0].status).toBe("rolled_over");
    expect(inv[0].remaining).toBe(0);
    expect(inv[1].carriedIn).toBe(51488);
    expect(inv[1].total).toBe(61488);
    // a dívida total permanece a mesma
    expect(inv[0].remaining + inv[1].remaining).toBe(81488 + 10000 - 30000);
  });
  it("pagamento a maior vira crédito na próxima fatura", () => {
    const inv = computeInvoices(nubank, [charge("2026-10", 10000), charge("2026-11", 8000)], [pay("2026-10", 15000)], "2026-10-19");
    expect(inv[0].status).toBe("credit");
    expect(inv[1].carriedIn).toBe(-5000);
    expect(inv[1].remaining).toBe(3000);
  });
});

describe("[10] estorno de compra", () => {
  const parts = buildInstallments(nubank, { purchaseId: "p", cardId: "nu", date: "2026-10-05", total: 30000, installments: 3 });

  it("estorno total creditado na fatura atual zera o líquido da compra", () => {
    const { credits, cancelIds } = planRefund(nubank, parts, "2026-10-10", { idPrefix: "r1" });
    expect(cancelIds).toEqual([]);
    expect(credits).toHaveLength(1);
    expect(credits[0].amount).toBe(-30000);
    expect(credits[0].invoiceRef).toBe("2026-10");
    expect(sum([...parts, ...credits].map((c) => c.amount))).toBe(0);
  });

  it("estorno total cancelando parcelas não faturadas", () => {
    const { credits, cancelIds } = planRefund(nubank, parts, "2026-11-01", { idPrefix: "r2", mode: "cancel_remaining" });
    expect(cancelIds).toEqual(["p#2", "p#3"]); // faturas 11 e 12
    expect(credits[0].amount).toBe(-10000); // só a parcela de outubro já faturada
    const after = [...parts.map((c) => (cancelIds.includes(c.id) ? { ...c, cancelled: true } : c)), ...credits];
    expect(sum(after.filter((c) => !c.cancelled).map((c) => c.amount))).toBe(0);
  });

  it("estorno parcial reduz só o valor estornado", () => {
    const { credits } = planRefund(nubank, parts, "2026-10-10", { idPrefix: "r3", amount: 5000 });
    expect(credits[0].amount).toBe(-5000);
    expect(() => planRefund(nubank, parts, "2026-10-10", { idPrefix: "x", amount: 40000 })).toThrow();
  });
});

describe("limite do cartão", () => {
  const parts = buildInstallments(nubank, { purchaseId: "p", cardId: "nu", date: "2026-10-05", total: 120000, installments: 12 });
  it("compra parcelada consome o limite pelo total (regra padrão)", () => {
    expect(availableLimit(nubank, 500000, parts, [], "2026-10-08").available).toBe(380000);
  });
  it("regra alternativa: só parcelas já faturadas", () => {
    expect(availableLimit(nubank, 500000, parts, [], "2026-10-08", "billed_only").available).toBe(490000);
  });
  it("pagamento libera limite", () => {
    expect(availableLimit(nubank, 500000, parts, [pay("2026-10", 10000)], "2026-10-19").available).toBe(390000);
  });
});
