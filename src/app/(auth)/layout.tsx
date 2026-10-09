import Image from "next/image";
import Link from "next/link";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { SetupGuide } from "@/components/setup/setup-guide";
import { isSupabaseConfigured } from "@/lib/env";

/** Assinatura completa da marca: símbolo, logotipo e slogan — como na identidade enviada. */
function BrandLockup({ size = "lg" }: { size?: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div aria-hidden className="absolute inset-[-30%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(194,15,73,0.35),transparent)] dark:bg-[radial-gradient(closest-side,rgba(194,15,73,0.45),transparent)]" />
        <Image
          src="/brand/mark-full.png"
          alt=""
          width={440}
          height={370}
          priority
          className={lg ? "h-auto w-[200px] xl:w-[230px]" : "h-auto w-[64px]"}
        />
      </div>
      <Image src="/brand/wordmark-on-light.png" alt="NEXO" width={757} height={156} priority className={`${lg ? "mt-8 w-[230px] xl:w-[260px]" : "mt-4 w-[120px]"} h-auto dark:hidden`} />
      <Image src="/brand/wordmark-on-dark.png" alt="NEXO" width={757} height={156} priority className={`${lg ? "mt-8 w-[230px] xl:w-[260px]" : "mt-4 w-[120px]"} hidden h-auto dark:block`} />
      <p className={`${lg ? "mt-5 text-[0.8125rem] tracking-[0.42em]" : "mt-3 text-[0.625rem] tracking-[0.36em]"} font-light text-plum/80 dark:text-blush/85`}>
        SEU DINHEIRO. TUDO CONECTADO<span className="text-crimson dark:text-rose">●</span>
      </p>
    </div>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-blush lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12 lg:border-r lg:border-border dark:bg-[#1d0d20]">
        {/* textura sutil: linhas finas que lembram a fita do símbolo */}
        <svg aria-hidden className="absolute inset-0 h-full w-full opacity-[0.5] dark:opacity-[0.35]" preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M-10 85 C 30 60, 60 110, 110 40" fill="none" stroke="url(#auth-line)" strokeWidth="0.25" />
          <path d="M-10 92 C 35 70, 65 118, 110 50" fill="none" stroke="url(#auth-line)" strokeWidth="0.18" />
          <defs>
            <linearGradient id="auth-line" x1="0" x2="1">
              <stop offset="0" stopColor="#C20F49" stopOpacity="0" />
              <stop offset="0.5" stopColor="#F25C8D" stopOpacity="0.8" />
              <stop offset="1" stopColor="#C20F49" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        <BrandLockup />
        <p className="absolute inset-x-0 bottom-10 mx-auto max-w-sm px-6 text-center text-sm text-plum/60 dark:text-blush/55">
          Contas, cartões e faturas no mesmo lugar, com o saldo de cada dia antes de ele acontecer.
        </p>
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
