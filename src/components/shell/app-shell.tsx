"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { motion } from "motion/react";
import { useEffect } from "react";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import { useTheme } from "@/lib/theme/provider";
import type { Theme } from "@/lib/theme/shared";
import { NAV } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  user,
  profileTheme,
  signOutAction,
  children,
}: {
  user: { name: string; email: string };
  profileTheme: Theme | null;
  signOutAction?: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  // o perfil é a fonte de verdade do tema (ex.: alterado em outro dispositivo)
  useEffect(() => {
    if (profileTheme && profileTheme !== theme) toggle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileTheme]);

  const initials = user.name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-sidebar px-4 py-6 lg:flex">
        <Link href="/" className="px-3" aria-label="NEXO, visão geral">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="mt-10 grid gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium transition-colors",
                  active ? "text-primary-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span layoutId="nav-active" className="absolute inset-0 rounded-xl bg-primary" transition={{ type: "spring", stiffness: 400, damping: 34 }} />
                )}
                <item.icon className="relative size-[18px]" />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
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
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* topo no celular */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md lg:hidden">
          <Logo markSize={30} />
          <CoinToggle />
        </header>

        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>
      </div>

      {/* navegação inferior no celular */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="mx-auto flex max-w-md">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-accent" : "text-ink-3")}
                >
                  <item.icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.8} />
                  {item.short}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 lg:mb-8">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] lg:text-[2rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-2">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <CoinToggle className="hidden lg:block" />
      </div>
    </div>
  );
}
