import { describe, expect, it } from "vitest";
import { categoryBreakdown, categoryColor, categoryFilterIds, categoryTree, hasNameConflict, normalizeCategoryName, type CategoryNode } from "../categories";

const all: CategoryNode[] = [
  { id: "t", name: "Transporte", parentId: null, kind: "expense", color: "#1C7ED6" },
  { id: "u", name: "Uber", parentId: "t", kind: "expense" },
  { id: "p", name: "Pets", parentId: null, kind: "expense" },
  { id: "r", name: "Receitas", parentId: null, kind: "income" },
  { id: "s", name: "Salário", parentId: "r", kind: "income" },
];

describe("categorias", () => {
  it("monta a árvore por tipo", () => {
    expect(categoryTree(all, "expense").map((g) => [g.parent.id, g.children.map((c) => c.id)])).toEqual([["t", ["u"]], ["p", []]]);
    expect(categoryTree(all, "income")).toHaveLength(1);
  });
  it("filtro pela principal inclui as subcategorias", () => {
    expect(categoryFilterIds("t", all)).toEqual(["t", "u"]);
    expect(categoryFilterIds("u", all)).toEqual(["u"]);
  });
  it("subcategoria herda a cor; sem cor, uma cor estável", () => {
    expect(categoryColor(all[1], all)).toBe("#1C7ED6");
    expect(categoryColor(all[2], all)).toBe(categoryColor(all[2], all));
    expect(categoryColor(all[2], all)).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("normaliza nome e acha repetidos sem diferenciar maiúsculas", () => {
    expect(normalizeCategoryName("  viagens   de  férias ")).toBe("Viagens de férias");
    expect(hasNameConflict(all, "uber", "t")).toBe(true);
    expect(hasNameConflict(all, "uber", null)).toBe(false);
    expect(hasNameConflict(all, "Uber", "t", "u")).toBe(false);
  });
});

describe("categoryBreakdown (drill-down)", () => {
  const cats = [
    { id: "t", name: "Transporte", parentId: null, color: "#1C7ED6" },
    { id: "u", name: "Uber", parentId: "t" },
    { id: "g", name: "Gasolina", parentId: "t" },
    { id: "m", name: "Mercado", parentId: null },
  ];
  const lines = [
    { categoryId: "u", amount: 3000 },
    { categoryId: "u", amount: 2000 },
    { categoryId: "g", amount: 10000 },
    { categoryId: "t", amount: 1500 }, // direto na principal
    { categoryId: "m", amount: 8000 },
    { categoryId: null, amount: 700 },
    { categoryId: "apagada", amount: 300 }, // categoria que não existe mais
  ];
  const b = categoryBreakdown(lines, cats);

  it("agrupa por principal e ordena do maior para o menor", () => {
    expect(b.map((x) => [x.name, x.amount])).toEqual([["Transporte", 16500], ["Mercado", 8000], ["Sem categoria", 1000]]);
  });
  it("subcategorias somam exatamente o total da principal, com 'Sem subcategoria'", () => {
    const t = b[0];
    expect(t.subs.map((s) => [s.name, s.amount])).toEqual([["Gasolina", 10000], ["Uber", 5000], ["Sem subcategoria", 1500]]);
    expect(t.subs.reduce((a, s) => a + s.amount, 0)).toBe(t.amount);
    expect(t.subs.find((s) => s.name === "Sem subcategoria")!.id).toBeNull();
  });
  it("principais somam o total geral (nada duplicado nem perdido)", () => {
    expect(b.reduce((a, x) => a + x.amount, 0)).toBe(lines.reduce((a, l) => a + l.amount, 0));
  });
  it("sem categoria e categoria apagada caem no mesmo grupo", () => {
    const n = b.find((x) => x.id === null)!;
    expect(n.amount).toBe(1000);
    expect(n.subs).toHaveLength(1);
  });
});
