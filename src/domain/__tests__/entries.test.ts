import { describe, expect, it } from "vitest";
import { adjustmentFor, checkStatusDate, defaultStatusFor, parseTags, sanitizeSearch, signedAmount } from "../entries";

describe("formulário de lançamentos", () => {
  it("sinal vem do tipo", () => {
    expect(signedAmount("expense", 4250)).toBe(-4250);
    expect(signedAmount("income", 4250)).toBe(4250);
    expect(signedAmount("refund", 100)).toBe(100);
    expect(() => signedAmount("expense", 0)).toThrow();
    expect(() => signedAmount("expense", -5)).toThrow();
  });
  it("realizada no futuro é recusada", () => {
    expect(checkStatusDate("confirmed", "2026-10-10", "2026-10-09")).toMatch(/agendada/);
    expect(checkStatusDate("confirmed", "2026-10-09", "2026-10-09")).toBeNull();
    expect(checkStatusDate("scheduled", "2026-10-10", "2026-10-09")).toBeNull();
  });
  it("situação padrão pela data", () => {
    expect(defaultStatusFor("2026-10-09", "2026-10-09", "expense")).toBe("confirmed");
    expect(defaultStatusFor("2026-10-20", "2026-10-09", "expense")).toBe("scheduled");
    expect(defaultStatusFor("2026-10-20", "2026-10-09", "income")).toBe("expected");
  });
  it("ajuste de saldo é a diferença exata", () => {
    expect(adjustmentFor(32112, 30000)).toBe(-2112);
    expect(adjustmentFor(-500, 0)).toBe(500);
    expect(adjustmentFor(100, 100)).toBe(0);
  });
  it("tags limpas e sem repetição", () => {
    expect(parseTags(" viagem, Lazer ,lazer,, pokémon  tcg ")).toEqual(["viagem", "Lazer", "pokémon tcg"]);
  });
  it("busca sem caracteres que quebram o filtro", () => {
    expect(sanitizeSearch("uber,(centro)%")).toBe("uber centro");
  });
});
