import { describe, expect, it } from "vitest";
import { fixedDueToRecord, fixedIncomeTotals, fixedOccurrences, fixedUpcoming, nextFixedReceipt, type FixedIncome } from "../fixed-income";
import type { Cents } from "../money";

const salary: FixedIncome = {
  id: "s1", kind: "salary", name: "Salário", clientName: null, amount: 500000 as Cents,
  dayOfMonth: 5, startDate: "2026-09-05", endDate: null, status: "active",
};
const client: FixedIncome = {
  id: "c1", kind: "client", name: "Manutenção", clientName: "Namba", amount: 150000 as Cents,
  dayOfMonth: 31, startDate: "2026-01-31", endDate: "2027-03-31", status: "active",
};

describe("renda fixa", () => {
  it("gera uma ocorrência por mês, com dia 31 ajustado ao mês", () => {
    const o = fixedOccurrences(client, "2027-01-01", "2027-04-30");
    expect(o.map((x) => x.date)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]); // acaba no fim do contrato
    expect(o.map((x) => x.periodKey)).toEqual(["2027-01", "2027-02", "2027-03"]);
  });

  it("lança só o que venceu (últimos 45 dias) e ainda não existe", () => {
    const due = fixedDueToRecord(salary, "2026-10-15", new Set());
    expect(due.map((x) => x.periodKey)).toEqual(["2026-09", "2026-10"]);
    expect(fixedDueToRecord(salary, "2026-10-15", new Set(["2026-10"])).map((x) => x.periodKey)).toEqual(["2026-09"]);
    // início muito antigo não gera um monte de meses atrasados
    const old = { ...salary, startDate: "2025-01-05" };
    expect(fixedDueToRecord(old, "2026-10-15", new Set()).map((x) => x.periodKey)).toEqual(["2026-09", "2026-10"]);
  });

  it("projeta meses futuros sem repetir os já lançados", () => {
    const up = fixedUpcoming(salary, "2026-10-15", "2027-01-31", new Set(["2026-10"]));
    expect(up.map((x) => x.date)).toEqual(["2026-11-05", "2026-12-05", "2027-01-05"]);
  });

  it("pausada ou encerrada não gera nada", () => {
    expect(fixedOccurrences({ ...salary, status: "paused" }, "2026-10-01", "2027-01-01")).toEqual([]);
    expect(nextFixedReceipt({ ...salary, status: "ended" }, "2026-10-15", new Set())).toBeNull();
  });

  it("próximo recebimento e totais", () => {
    expect(nextFixedReceipt(salary, "2026-10-15", new Set(["2026-10"]))?.date).toBe("2026-11-05");
    const t = fixedIncomeTotals([salary, client, { ...client, id: "c2", status: "paused" }]);
    expect(t).toMatchObject({ monthly: 650000, salary: 500000, clients: 150000, yearly: 7800000, activeCount: 2 });
  });

  it("depois de limpar lançamentos, meses já passados não são recriados (mas os futuros continuam)", () => {
    const cleared = { ...salary, clearedBefore: "2026-10-05" };
    expect(fixedDueToRecord(cleared, "2026-10-15", new Set()).map((x) => x.periodKey)).toEqual([]);
    expect(fixedDueToRecord(cleared, "2026-11-10", new Set()).map((x) => x.periodKey)).toEqual(["2026-11"]);
    // sem marcador, o comportamento antigo continua
    expect(fixedDueToRecord(salary, "2026-10-15", new Set()).map((x) => x.periodKey)).toEqual(["2026-09", "2026-10"]);
  });
});
