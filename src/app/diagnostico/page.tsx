import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, CircleMinus, CircleX } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/env";
import { runDiagnostics, type CheckStatus } from "@/lib/diagnostics";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Diagnóstico" };
export const dynamic = "force-dynamic";

const ICON: Record<CheckStatus, { icon: typeof CircleCheck; className: string; label: string }> = {
  ok: { icon: CircleCheck, className: "text-positive", label: "Certo" },
  error: { icon: CircleX, className: "text-negative", label: "Precisa corrigir" },
  warning: { icon: CircleAlert, className: "text-warning", label: "Atenção" },
  skipped: { icon: CircleMinus, className: "text-ink-3", label: "Opcional" },
};

/** Confere, passo a passo, o que o login precisa para funcionar. */
export default async function DiagnosticsPage() {
  // em produção já configurada, não expõe detalhes da instalação
  if (process.env.NODE_ENV === "production" && isSupabaseConfigured()) notFound();
  const checks = await runDiagnostics();
  const blocking = checks.some((c) => c.status === "error");

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
      <header className="flex items-center justify-between">
        <Logo />
        <CoinToggle />
      </header>
      <h1 className="mt-12 text-[1.875rem] font-semibold leading-tight tracking-[-0.03em]">Diagnóstico da configuração</h1>
      <p className="mt-2 text-ink-2">
        {blocking
          ? "Corrija os itens marcados em vermelho, salve, reinicie o npm run dev se mexer no .env.local e teste de novo."
          : "Tudo pronto para criar sua conta e entrar."}
      </p>

      <ol className="mt-8 grid gap-3">
        {checks.map((c) => {
          const s = ICON[c.status];
          return (
            <li key={c.id} className={cn("rounded-2xl border bg-surface p-4 sm:p-5", c.status === "error" ? "border-[color-mix(in_oklab,var(--negative)_45%,var(--border))]" : "border-border")}>
              <div className="flex items-start gap-3">
                <s.icon className={cn("mt-0.5 size-5 shrink-0", s.className)} aria-label={s.label} />
                <div className="min-w-0">
                  <p className="font-medium">{c.title}</p>
                  <p className="mt-1 text-sm text-ink-2">{c.detail}</p>
                  {c.fix && <p className="mt-2 text-sm text-ink">{c.fix}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant={blocking ? "primary" : "outline"}>
          <Link href="/diagnostico">Testar de novo</Link>
        </Button>
        {!blocking && (
          <Button asChild>
            <Link href="/cadastro">Criar minha conta</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
