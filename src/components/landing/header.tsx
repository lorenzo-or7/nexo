"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import * as React from "react";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const NAV_LINKS = [
  { href: "#funcionalidades", label: "Funcionalidades" },
  { href: "#demonstracao", label: "Demonstração" },
  { href: "#faq", label: "FAQ" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={cn("sticky top-0 z-40 transition-[background-color,border-color,box-shadow] duration-300", scrolled || open ? "border-b border-border bg-bg/85 backdrop-blur-md" : "border-b border-transparent")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="NEXO, página inicial" className="rounded-lg">
          <Logo markSize={32} />
        </Link>

        <nav aria-label="Seções da página" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-[0.9375rem] text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <CoinToggle className="size-9" />
          <Button asChild variant="ghost" className="hidden h-10 px-3 md:inline-flex">
            <Link href="/entrar">Entrar</Link>
          </Button>
          <Button asChild variant="accent" className="hidden h-10 px-4 text-sm md:inline-flex">
            <Link href="/cadastro">Criar conta</Link>
          </Button>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="menu-mobile"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-full border border-border-strong bg-field/60 md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <div id="menu-mobile" className={cn("grid overflow-hidden transition-[grid-template-rows] duration-300 md:hidden", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0" inert={!open}>
          <nav aria-label="Menu" className="mx-auto grid max-w-6xl gap-1 px-5 pb-5 pt-1 sm:px-8">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-base font-medium text-ink hover:bg-surface-2">
                {l.label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Button asChild variant="outline" size="lg"><Link href="/entrar">Entrar</Link></Button>
              <Button asChild variant="accent" size="lg"><Link href="/cadastro">Criar conta</Link></Button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
