import Link from "next/link";
import { BrandImages } from "@/components/brand/logo";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { SetupGuide } from "@/components/setup/setup-guide";
import { isSupabaseConfigured } from "@/lib/env";

/** Assinatura completa da marca: símbolo, logotipo e slogan — como na identidade enviada. */
function BrandLockup({ size = "lg" }: { size?: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <div className="flex flex-col items-center text-center">
      <BrandImages large={lg} />
      <p className={`${lg ? "mt-5 text-[0.8125rem] tracking-[0.42em]" : "mt-3 text-[0.625rem] tracking-[0.36em]"} font-light text-plum/80 dark:text-blush/85`}>
        SEU DINHEIRO. TUDO CONECTADO<span className="text-crimson dark:text-rose">●</span>
      </p>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="hidden p-3 lg:sticky lg:top-0 lg:block lg:h-dvh">
        <div className="panel relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[2rem] bg-blush p-12 dark:bg-sidebar">
          {/* órbitas finas ao redor do símbolo: desenho estático, sem custo de animação */}
          <svg aria-hidden className="absolute left-1/2 top-[44%] h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2" viewBox="0 0 800 800">
            <defs>
              <radialGradient id="auth-core" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="var(--brand-crimson)" stopOpacity="0.35" />
                <stop offset="1" stopColor="var(--brand-crimson)" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="auth-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--brand-rose)" stopOpacity="0.55" />
                <stop offset="0.5" stopColor="var(--brand-rose)" stopOpacity="0.04" />
                <stop offset="1" stopColor="var(--brand-crimson)" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <circle cx="400" cy="400" r="210" fill="url(#auth-core)" />
            {[150, 210, 280, 360].map((r) => (
              <circle key={r} cx="400" cy="400" r={r} fill="none" stroke="url(#auth-ring)" strokeWidth="1" />
            ))}
            <circle cx="610" cy="400" r="3.5" fill="var(--brand-rose)" />
            <circle cx="202" cy="268" r="2.5" fill="var(--brand-rose)" opacity="0.7" />
            <circle cx="545" cy="660" r="2" fill="var(--brand-blush)" opacity="0.6" />
          </svg>
          <div className="relative">
            <BrandLockup />
          </div>
          <p className="absolute inset-x-0 bottom-10 mx-auto max-w-sm px-6 text-center text-sm text-plum/60 dark:text-blush/55">
            Contas, cartões e faturas no mesmo lugar, com o saldo de cada dia antes de ele acontecer.
          </p>
        </div>
      </aside>

      <main className="relative flex flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
        <div className="flex justify-end">
          <CoinToggle />
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-8">
          <div className="mb-10 lg:hidden">
            <BrandLockup size="sm" />
          </div>
          {isSupabaseConfigured() ? children : <SetupGuide />}
          {isSupabaseConfigured() && process.env.NODE_ENV !== "production" && (
            <p className="mt-8 text-center text-sm text-ink-3">
              Algo não funciona? <Link href="/diagnostico" className="font-medium text-accent underline-offset-4 hover:underline">Verificar a configuração</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
