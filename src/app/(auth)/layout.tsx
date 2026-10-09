import Image from "next/image";
import { CoinToggle } from "@/components/brand/coin-toggle";
import { Logo } from "@/components/brand/logo";
import { isSupabaseConfigured } from "@/lib/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-plum text-blush lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Image src="/brand/wordmark-on-dark.png" alt="NEXO" width={120} height={25} priority className="h-auto w-[120px]" />
        <div className="relative z-10 max-w-sm">
          <p className="text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.035em]">
            Seu dinheiro.
            <br />
            Tudo conectado.
          </p>
          <ul className="mt-10 grid gap-4 text-[0.9375rem] text-blush/75">
            <li>Contas, cartões e faturas no mesmo lugar, sem contar a mesma compra duas vezes.</li>
            <li>O saldo de cada dia até o fim do mês, antes de ele acontecer.</li>
            <li>Uma resposta honesta para &ldquo;quanto posso gastar hoje?&rdquo;</li>
          </ul>
        </div>
        <p className="relative z-10 text-sm text-blush/50">Seus dados ficam só na sua conta.</p>
        <Image
          src="/brand/mark-full.png"
          alt=""
          width={440}
          height={370}
          priority
          className="pointer-events-none absolute -bottom-16 -right-24 w-[420px] [filter:drop-shadow(0_40px_80px_rgba(194,15,73,0.35))] xl:w-[480px]"
        />
      </aside>

      <main className="flex flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-10">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <CoinToggle />
        </div>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
          {!isSupabaseConfigured() && (
            <div role="status" className="mb-6 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
              Ambiente sem Supabase configurado. Preencha <code>.env.local</code> a partir de <code>.env.example</code> para habilitar o login.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
