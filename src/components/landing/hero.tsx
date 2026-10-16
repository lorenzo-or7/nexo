import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPreview } from "./dashboard-preview";
import { TiltFrame } from "./tilt-frame";

export function Hero() {
  return (
    <section aria-labelledby="titulo-hero" className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[46rem] bg-[radial-gradient(60rem_30rem_at_50%_-8%,var(--glow-1),transparent_70%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-10 lg:pb-28 lg:pt-16">
        <div className="rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-field/60 px-3.5 py-1.5 text-[0.8125rem] font-medium text-ink-2">
            <span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
            Gestão financeira pessoal
          </p>
          <h1 id="titulo-hero" className="mt-6 text-balance text-[clamp(2.5rem,7.4vw,4.1rem)] font-semibold leading-[1] tracking-[-0.05em]">
            Seu dinheiro.
            <span className="text-hero block whitespace-nowrap pb-1">Tudo conectado.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2 sm:text-lg">
            Contas, cartões, despesas e seu futuro financeiro em um só lugar. Mais clareza para decidir. Mais controle para viver.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="accent" size="lg" className="group h-13 px-6 text-base">
              <Link href="/cadastro">
                Começar agora
                <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-13 px-6 text-base">
              <a href="#demonstracao">Explorar o NEXO</a>
            </Button>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-ink-3">
            <ShieldCheck className="size-4 shrink-0 text-positive" aria-hidden />
            Cada pessoa só enxerga os próprios dados.
          </p>
        </div>

        <TiltFrame className="relative">
          <DashboardPreview />
          <div aria-hidden className="panel-quiet absolute -bottom-12 left-6 hidden rounded-2xl px-4 py-3 text-xs shadow-[var(--shadow)] sm:block lg:-left-8">
            <p className="text-ink-3">Receita prevista · dia 5</p>
            <p className="mt-0.5 text-base font-semibold text-positive">+ R$ 4.200,00</p>
          </div>
        </TiltFrame>
      </div>
    </section>
  );
}
