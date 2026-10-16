import { afterEach, describe, expect, it } from "vitest";
import { LEGAL_LINKS, legalLinks } from "../legal";

describe("links legais", () => {
  afterEach(() => {
    LEGAL_LINKS.privacy = null;
    LEGAL_LINKS.terms = null;
  });

  it("sem documentos publicados, nenhum link é exibido (nada inventado)", () => {
    expect(legalLinks()).toEqual([]);
  });

  it("quando o caminho é informado, o link passa a existir", () => {
    LEGAL_LINKS.privacy = "/privacidade";
    LEGAL_LINKS.terms = "/termos";
    expect(legalLinks()).toEqual([
      { href: "/privacidade", label: "Política de Privacidade" },
      { href: "/termos", label: "Termos de Uso" },
    ]);
  });
});
