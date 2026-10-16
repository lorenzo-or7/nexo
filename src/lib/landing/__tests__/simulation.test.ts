import { describe, expect, it } from "vitest";
import { clampDay, clampMoney, describeResult, parseMoneyText, SIM_DAYS, SIM_DEFAULTS, simulate } from "../simulation";
import { shouldShowLanding } from "../routing";

describe("simulador da página inicial", () => {
  it("valores iniciais: 5.000 + 3.500 − 2.200 = 6.300", () => {
    const r = simulate(SIM_DEFAULTS);
    expect(r.final).toBe(630000);
    expect(r.delta).toBe(130000);
    expect(r.status).toBe("up");
    expect(r.series).toHaveLength(SIM_DAYS + 1);
    expect(r.series[0].balance).toBe(500000);
    expect(r.series[SIM_DAYS].balance).toBe(r.final);
  });

  it("saldo final não depende dos dias escolhidos", () => {
    const a = simulate({ ...SIM_DEFAULTS, incomeDay: 1, expenseDay: 30 });
    const b = simulate({ ...SIM_DEFAULTS, incomeDay: 30, expenseDay: 1 });
    expect(a.final).toBe(b.final);
  });

  it("despesa maior que saldo + receita: negativo, com alerta e dia do primeiro negativo", () => {
    const r = simulate({ initial: 1000, income: 0, expense: 3000, incomeDay: 5, expenseDay: 12 });
    expect(r.final).toBe(-200000);
    expect(r.status).toBe("down");
    expect(r.firstNegativeDay).toBe(12);
    expect(r.lowest).toEqual({ day: 12, balance: -200000 });
    expect(describeResult(r)).toContain("fica negativo");
  });

  it("a ordem dos dias pode deixar o saldo negativo mesmo terminando positivo", () => {
    const r = simulate({ initial: 500, income: 3000, expense: 2000, incomeDay: 20, expenseDay: 3 });
    expect(r.final).toBeGreaterThan(0);
    expect(r.firstNegativeDay).toBe(3);
  });

  it("tudo zerado: inalterado", () => {
    const r = simulate({ initial: 0, income: 0, expense: 0, incomeDay: 1, expenseDay: 1 });
    expect(r.status).toBe("flat");
    expect(r.final).toBe(0);
    expect(r.firstNegativeDay).toBeNull();
    expect(describeResult(r)).toContain("fica igual");
  });

  it("receita igual à despesa: inalterado", () => {
    expect(simulate({ initial: 100, income: 700, expense: 700, incomeDay: 2, expenseDay: 9 }).status).toBe("flat");
  });

  it("limites e entradas inválidas são contidos", () => {
    expect(clampMoney(-50)).toBe(0);
    expect(clampMoney(99_999_999)).toBe(1_000_000);
    expect(clampMoney(Number.NaN)).toBe(0);
    expect(clampMoney("abc")).toBe(0);
    expect(clampMoney(12.6)).toBe(13);
    expect(clampDay(0)).toBe(1);
    expect(clampDay(99)).toBe(SIM_DAYS);
    expect(parseMoneyText("R$ 1.500")).toBe(1500);
    expect(parseMoneyText("")).toBe(0);
    expect(parseMoneyText("9999999999")).toBe(1_000_000);
    expect(simulate({ initial: -5, income: 1e12, expense: Number.NaN, incomeDay: -1, expenseDay: 500 }).final).toBe(100_000_000);
  });

  it("mensagem em reais", () => {
    expect(describeResult(simulate(SIM_DEFAULTS))).toMatch(/sobe R\$\s?1\.300,00 e chega a R\$\s?6\.300,00/);
  });
});

describe("rota da página inicial", () => {
  it("só a raiz sem sessão mostra a landing", () => {
    expect(shouldShowLanding("/", false)).toBe(true);
    expect(shouldShowLanding("/", true)).toBe(false);
    expect(shouldShowLanding("/contas", false)).toBe(false);
    expect(shouldShowLanding("/entrar", false)).toBe(false);
  });
});
