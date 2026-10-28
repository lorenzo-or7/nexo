import { describe, expect, it } from "vitest";
import { csvCell, entriesToCsv } from "../csv";

describe("exportação CSV", () => {
  it("neutraliza fórmulas, mas mantém números negativos", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-25,00")).toBe("-25,00");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell(null)).toBe("");
  });

  it("monta lançamentos com nomes de conta/categoria e valores em reais, sem ids nem segredos", () => {
    const csv = entriesToCsv({
      accounts: [{ id: "a1", name: "Conta Nubank" }],
      categories: [{ id: "c1", name: "Transporte", parent_id: null }, { id: "c2", name: "Uber", parent_id: "c1" }],
      entries: [
        { id: "e1", occurred_on: "2026-10-02", kind: "expense", status: "confirmed", amount_cents: -2550, description: "Corrida", account_id: "a1", category_id: "c2" },
        { id: "e2", occurred_on: "2026-10-05", kind: "income", status: "expected", amount_cents: 500000, description: "Salário", account_id: "a1", category_id: null },
        { id: "e3", occurred_on: "2026-10-06", kind: "expense", status: "confirmed", amount_cents: -100, description: "Apagado", account_id: "a1", deleted_at: "2026-10-07" },
      ],
    });
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines).toHaveLength(3); // cabeçalho + 2 (o apagado não entra)
    expect(lines[1]).toContain("2026-10-05;income;expected;5000,00;Salário;Conta Nubank");
    expect(lines[2]).toContain("-25,50;Corrida;Conta Nubank;Transporte > Uber");
    expect(csv).not.toContain("e1");
  });
});
