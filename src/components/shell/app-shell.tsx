"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { DeveloperSignature } from "@/components/brand/developer-signature";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import type { PaletteId } from "@/lib/theme/palettes";
import { useTheme } from "@/lib/theme/provider";
import type { Theme } from "@/lib/theme/shared";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { NAV, isActive } from "./nav";
import { QuickEntryButton } from "@/components/entries/entry-dialog";
import type { QuickEntryData } from "@/lib/data/ledger";


export function AppShell({
  user,
  profileTheme,
  profilePalette,
  signOutAction,
  quickEntry,
  children,
}: {
  user: { name: string; email: string };
  profileTheme: Theme | null;
  profilePalette?: PaletteId | null;
  signOutAction?: () => Promise<void>;
  quickEntry?: QuickEntryData;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggle, palette, setPalette } = useTheme();

  // o perfil é a fonte de verdade do tema (ex.: alterado em outro dispositivo)
  useEffect(() => {
    if (profileTheme && profileTheme !== theme) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTheme]);
  useEffect(() => {
    if (profilePalette && profilePalette !== palette) setPalette(profilePalette);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profilePalette]);

  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [pathname]);
  const moreItems = NAV.filter((item) => item.more);
  const moreActive = moreItems.some((item) => isActive(pathname, item.href));

  const initials = user.name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      {/* sidebar */}
      {/* menu sempre no tom escuro da marca: contraste com o conteúdo no modo claro */}
      <aside data-theme="dark" className="sticky top-0 hidden h-dvh p-3 text-ink lg:block">
        <div className="panel flex h-full flex-col rounded-[1.5rem] bg-sidebar px-4 py-6">
        <Link href="/" className="px-3" aria-label="NEXO, visão geral">
          <Logo />
        </Link>
        {quickEntry && <div className="mt-8 px-1"><QuickEntryButton data={quickEntry} variant="sidebar" /></div>}
        <nav aria-label="Principal" className={cn("grid gap-1", quickEntry ? "mt-6" : "mt-10")}>
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium transition-colors",
                  active ? "text-ink" : "text-ink-2 hover:bg-surface-2/70 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-xl border border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent)_22%,transparent),color-mix(in_oklab,var(--accent)_4%,transparent))]"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  >
                    <span className="absolute -left-px top-2.5 bottom-2.5 w-[3px] rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                  </motion.span>
                )}
                <item.icon className={cn("relative size-[18px]", active && "text-accent")} />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-2xl border border-border bg-field/50 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-ink-3">{user.email}</span>
          </span>
          {signOutAction && (
            <form action={signOutAction}>
              <button type="submit" className="grid size-9 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Sair" title="Sair">
                <LogOut className="size-4" />
              </button>
            </form>
          )}
        </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* topo no celular */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden">
          <Logo markSize={30} />
          <CoinToggle />
        </header>

        <main className="rise w-full max-w-[1520px] flex-1 px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:pt-9">{children}</main>

        {/* assinatura: colada ao rodapé da área de conteúdo, fora do fluxo das páginas */}
        <footer className="px-4 pb-28 pt-4 lg:pb-5">
          <DeveloperSignature size="sm" />
        </footer>
      </div>

      {quickEntry && <QuickEntryButton data={quickEntry} variant="fab" />}

      {/* navegação inferior no celular */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/88 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto flex w-full max-w-xl">
          {NAV.filter((item) => !item.more).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium", active ? "text-accent" : "text-ink-3")}
                >
                  {active && <span aria-hidden className="absolute top-0 h-[2px] w-8 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
                  <item.icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} />
                  <span className="max-w-full truncate">{item.short}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn("relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium", moreActive ? "text-accent" : "text-ink-3")}
            >
              {moreActive && <span aria-hidden className="absolute top-0 h-[2px] w-8 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />}
              <Ellipsis className="size-[22px]" strokeWidth={moreActive ? 2.3 : 1.8} />
              <span className="max-w-full truncate">Mais</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="Mais opções" className="[--dialog-w:420px] lg:hidden">
          <ul className="grid gap-1 p-3">
            {moreItems.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn("flex h-12 items-center gap-3 rounded-xl px-3 font-medium", active ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-2")}
                  >
                    <item.icon className="size-5" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {signOutAction && (
              <li>
                <form action={signOutAction}>
                  <button type="submit" className="flex h-12 w-full items-center gap-3 rounded-xl px-3 font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                    <LogOut className="size-5" />
                    Sair
                  </button>
                </form>
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div>
        <h1 className="text-[1.875rem] font-semibold leading-tight tracking-[-0.035em] lg:text-[2.25rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <CoinToggle className="hidden lg:block" />
      </div>
    </div>
  );
}
