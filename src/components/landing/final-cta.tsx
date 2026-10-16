import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section aria-labelledby="titulo-cta" className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
      <Reveal className="panel relative isolate overflow-hidden rounded-[2rem] px-6 py-16 text-center sm:px-12 sm:py-20">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_22rem_at_50%_0%,var(--glow-1),transparent_70%),radial-gradient(34rem_20rem_at_100%_100%,var(--glow-2),transparent_70%)]" />
        <div className="flex justify-center"><Logo markSize={52} /></div>
        <h2 id="titulo-cta" className="mx-auto mt-8 max-w-3xl text-[clamp(2rem,6vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.045em]">
          Seu dinheiro merece uma <span className="text-hero">visão melhor.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-ink-2">Comece a organizar suas finanças com mais clareza, controle e planejamento.</p>
        <div className="mt-9 flex justify-center">
          <Button asChild variant="accent" size="lg" className="group h-13 px-7 text-base">
            <Link href="/cadastro">
              Criar minha conta
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </Reveal>
    </section>
  );
}
