/**
 * Documentos legais publicados. PENDÊNCIA: a Política de Privacidade e os Termos de Uso ainda
 * não existem. Quando forem criados, informe aqui o caminho (ex.: "/privacidade") e os links
 * passam a aparecer sozinhos na landing, no login e no cadastro. Nada é inventado enquanto isso.
 */
export const LEGAL_LINKS: { privacy: string | null; terms: string | null } = {
  privacy: null,
  terms: null,
};

export function legalLinks(): { href: string; label: string }[] {
  const out: { href: string; label: string }[] = [];
  if (LEGAL_LINKS.privacy) out.push({ href: LEGAL_LINKS.privacy, label: "Política de Privacidade" });
  if (LEGAL_LINKS.terms) out.push({ href: LEGAL_LINKS.terms, label: "Termos de Uso" });
  return out;
}
