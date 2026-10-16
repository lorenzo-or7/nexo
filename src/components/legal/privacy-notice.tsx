import Link from "next/link";
import { Database, Download, ShieldCheck } from "lucide-react";
import { legalLinks } from "@/lib/legal";
import { SecureConnectionBadge } from "./secure-badge";

/**
 * Aviso de privacidade das telas de entrada. Todas as afirmações abaixo foram conferidas no código
 * (isolamento por conta com RLS, exportação e exclusão de dados). Não afirma certificações nem "100% seguro".
 */
export function PrivacyNotice() {
  const links = legalLinks();
  return (
    <aside aria-labelledby="aviso-privacidade" className="mt-8 rounded-2xl border border-border bg-field/50 p-4 text-left">
      <div className="flex gap-3">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
        <div>
          <p id="aviso-privacidade" className="font-medium">Sua privacidade importa.</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            A Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018) garante direitos sobre seus dados pessoais, como acesso, correção e exclusão. No NEXO você pode exportar e excluir tudo em Configurações.
          </p>
          {links.length > 0 && (
            <p className="mt-2 text-sm text-ink-2">
              Entenda como suas informações pessoais e financeiras são tratadas e protegidas pelo NEXO:{" "}
              {links.map((l, i) => (
                <span key={l.href}>
                  {i > 0 && " · "}
                  <Link href={l.href} className="font-medium text-accent underline-offset-4 hover:underline">{l.label}</Link>
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </div>
      <ul aria-label="Proteções verificadas" className="mt-3 flex flex-wrap gap-2 text-xs text-ink-2">
        <SecureConnectionBadge />
        <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-field/60 px-2.5 py-1">
          <Database aria-hidden className="size-3 text-accent" />
          Dados isolados por conta
        </li>
        <li className="inline-flex items-center gap-1.5 rounded-full border border-border bg-field/60 px-2.5 py-1">
          <Download aria-hidden className="size-3 text-accent" />
          Exporte ou exclua seus dados
        </li>
      </ul>
    </aside>
  );
}
