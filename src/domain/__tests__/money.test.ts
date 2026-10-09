import { describe, expect, it } from "vitest";
import { formatBRL, mulDiv, parseBRL, splitEven, sum, MoneyError } from "../money";

describe("[15] precisão monetária", () => {
  it("0,1 + 0,2 é exatamente 0,30 em centavos (o clássico erro de float não ocorre)", () => {
    expect(0.1 + 0.2).not.toBe(0.3); // prova que float erraria
    expect(sum([parseBRL("0,10"), parseBRL("0,20")])).toBe(30);
  });

  it("somar 1 milhão de lançamentos de R$ 0,01 dá exatamente R$ 10.000,00", () => {
    expect(sum(Array.from({ length: 1_000_000 }, () => 1))).toBe(1_000_000);
    expect(formatBRL(1_000_000)).toBe("R$ 10.000,00");
  });

  it("interpreta formatos brasileiros sem passar por float", () => {
    expect(parseBRL("85")).toBe(8500);
    expect(parseBRL("85,5")).toBe(8550);
    expect(parseBRL("R$ 1.234,56")).toBe(123456);
    expect(parseBRL("42.50")).toBe(4250);
    expect(parseBRL("1.000")).toBe(100000);
    expect(parseBRL("-12,30")).toBe(-1230);
    expect(parseBRL("321,12")).toBe(32112);
  });

  it("rejeita entradas ambíguas ou com mais de 2 casas", () => {
    expect(() => parseBRL("1,234")).toThrow(MoneyError);
    expect(() => parseBRL("abc")).toThrow(MoneyError);
    expect(() => parseBRL("")).toThrow(MoneyError);
    expect(() => parseBRL("1,2,3")).toThrow(MoneyError);
  });

  it("rejeita valores não inteiros em centavos", () => {
    expect(() => sum([1.5])).toThrow(MoneyError);
  });

  it("divide parcelas sem perder centavos; o resto vai para as primeiras", () => {
    expect(splitEven(8500, 2)).toEqual([4250, 4250]);
    expect(splitEven(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEven(1, 3)).toEqual([1, 0, 0]);
    for (const [t, n] of [[99999, 7], [12345, 12], [1, 1], [100, 48]] as const) {
      expect(sum(splitEven(t, n))).toBe(t);
    }
  });

  it("mulDiv arredonda half-even explicitamente", () => {
    expect(mulDiv(100, 1, 3)).toBe(33); // 33,33…
    expect(mulDiv(5, 1, 2)).toBe(2); // 2,5 → 2 (par)
    expect(mulDiv(7, 1, 2)).toBe(4); // 3,5 → 4 (par)
    expect(mulDiv(-5, 1, 2)).toBe(-2);
    expect(mulDiv(119880, 1, 12)).toBe(9990); // anual R$ 1.198,80 → R$ 99,90/mês
  });

  it("formata em BRL", () => {
    expect(formatBRL(26323)).toBe("R$ 263,23");
    expect(formatBRL(-54468)).toBe("-R$ 544,68");
    expect(formatBRL(81268, { signed: true })).toBe("+R$ 812,68");
  });
});
