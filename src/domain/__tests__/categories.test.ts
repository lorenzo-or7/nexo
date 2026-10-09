import { describe, expect, it } from "vitest";
import { categoryColor, categoryFilterIds, categoryTree, hasNameConflict, normalizeCategoryName, type CategoryNode } from "../categories";

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
