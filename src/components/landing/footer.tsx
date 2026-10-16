import Link from "next/link";
import { DeveloperSignature } from "@/components/brand/developer-signature";
import { Logo } from "@/components/brand/logo";
import { legalLinks } from "@/lib/legal";

/** Links legais só aparecem quando os documentos existem (src/lib/legal.ts). Pendência registrada em docs/LANDING.md. */
export function LandingFooter() {
  const year = new Date().getFullYear();
  const legal = legalLinks();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo markSize={30} />
          <p className="mt-4 text-sm text-ink-2">Seu dinheiro. Tudo conectado.</p>
        </div>
        <nav aria-label="Rodapé: página" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Explorar</p>
          <a href="#funcionalidades" className="text-ink-2 hover:text-ink">Funcionalidades</a>
          <a href="#demonstracao" className="text-ink-2 hover:text-ink">Demonstração</a>
          <a href="#faq" className="text-ink-2 hover:text-ink">FAQ</a>
        </nav>
        <nav aria-label="Rodapé: conta" className="grid content-start gap-2 text-sm">
          <p className="font-semibold">Sua conta</p>
          <Link href="/entrar" className="text-ink-2 hover:text-ink">Entrar</Link>
          <Link href="/cadastro" className="text-ink-2 hover:text-ink">Criar conta</Link>
          {legal.map((l) => (
            <Link key={l.href} href={l.href} className="text-ink-2 hover:text-ink">{l.label}</Link>
          ))}
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-5 pb-10 sm:px-8 md:flex-row md:justify-between">
        <p className="text-xs text-ink-3">© {year} NEXO. Todos os direitos reservados.</p>
        <DeveloperSignature size="sm" />
      </div>
    </footer>
  );
}
