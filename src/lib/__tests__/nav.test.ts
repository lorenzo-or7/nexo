import { describe, expect, it } from "vitest";
import { NAV, isActive } from "@/components/shell/nav";

describe("menu: item aceso", () => {
  it("'Contas' não acende em 'Contas fixas' (e vice-versa)", () => {
    expect(isActive("/contas-fixas", "/contas")).toBe(false);
    expect(isActive("/contas", "/contas-fixas")).toBe(false);
    expect(isActive("/contas-fixas", "/contas-fixas")).toBe(true);
    expect(isActive("/contas", "/contas")).toBe(true);
  });

  it("subrotas acendem o item pai; o início só acende em '/'", () => {
    expect(isActive("/lancamentos/novo", "/lancamentos")).toBe(true);
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/contas", "/")).toBe(false);
  });

  it("'Contas fixas' está no menu e as rotas são únicas", () => {
    expect(NAV.some((i) => i.href === "/contas-fixas" && i.label === "Contas fixas")).toBe(true);
    expect(new Set(NAV.map((i) => i.href)).size).toBe(NAV.length);
  });

  it("a barra inferior do celular continua com no máximo 4 atalhos + 'Mais'", () => {
    expect(NAV.filter((i) => !i.more).length).toBeLessThanOrEqual(4);
  });
});
