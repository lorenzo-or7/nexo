import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/** Sem links para política de privacidade ou termos: esses documentos ainda não existem (pendência registrada). */
export function LandingFooter() {
  const year = new Date().getFullYear();
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
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-5 pb-10 text-xs text-ink-3 sm:px-8">© {year} NEXO. Todos os direitos reservados.</p>
    </footer>
  );
}
