import { CalendarClock, CreditCard, Layers, Receipt, Repeat, Smartphone, Tags, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";
import { areaFrom, scale, stepPath } from "./mini-chart";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section";

/**
 * Só aparece aqui o que o NEXO já faz: contas, transferências, cartões, faturas, parcelamentos,
 * assinaturas, renda fixa, categorias, projeção do saldo e uso no celular.
 */
function Card({ className, icon: Icon, title, text, children, delay }: { className?: string; icon: typeof Wallet; title: string; text: string; children?: React.ReactNode; delay?: number }) {
  return (
    <Reveal as="li" delay={delay} className={cn("panel group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] p-6 transition-transform duration-300 hover:-translate-y-1", className)}>
      <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="size-[1.15rem]" aria-hidden /></span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-md text-[0.9375rem] leading-relaxed text-ink-2">{text}</p>
      {children && <div aria-hidden className="mt-auto pt-6">{children}</div>}
    </Reveal>
  );
}

const PROJ = [2400, 2400, 1900, 1900, 6100, 6100, 5600, 5600, 4800, 4800, 4800, 3900, 3900, 6700, 6700, 6200, 5300, 5300, 4700, 4700];

function ProjectionVisual() {
  const W = 420;
  const H = 190;
  const { x, y } = scale(PROJ, W, H, 8);
  const line = stepPath(PROJ, x, y);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lp-bento-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaFrom(line, x(PROJ.length - 1), H)} fill="url(#lp-bento-fill)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinejoin="round" />
      <path d={`M ${x(13)} ${y(PROJ[13])} H ${x(19)}`} stroke="var(--chart-expected)" strokeWidth="2.25" strokeDasharray="5 4" fill="none" />
    </svg>
  );
}

export function Bento() {
  return (
    <section id="funcionalidades" aria-labelledby="titulo-funcionalidades" className="scroll-mt-20 mx-auto max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28">
      <SectionHeading id="titulo-funcionalidades" eyebrow="Funcionalidades" title="Tudo o que você precisa para organizar suas finanças." />
      <ul className="mt-14 grid auto-rows-auto gap-4 md:grid-cols-6 lg:gap-5">
        <Card className="md:col-span-6 lg:col-span-4 lg:row-span-2" icon={CalendarClock} title="Projeção do saldo, dia a dia" text="Veja o menor saldo previsto e quanto está livre para gastar antes de gastar. Recebimentos previstos aparecem separados dos confirmados.">
          <ProjectionVisual />
          <p className="mt-2 text-xs text-ink-3">Exemplo com dados fictícios · linha tracejada: receita prevista</p>
        </Card>

        <Card className="md:col-span-3 lg:col-span-2" icon={Wallet} title="Múltiplas contas" text="Cadastre quantas contas quiser e transfira entre elas." delay={60}>
          <ul className="grid gap-1.5 text-xs">
            {[["Conta principal", "R$ 1.250,00"], ["Reserva", "R$ 550,00"]].map(([n, v]) => (
              <li key={n} className="flex justify-between rounded-lg border border-border bg-field/50 px-3 py-2"><span className="text-ink-2">{n}</span><span className="font-medium">{v}</span></li>
            ))}
          </ul>
        </Card>

        <Card className="md:col-span-3 lg:col-span-2" icon={CreditCard} title="Cartões e faturas" text="Compras caem na fatura certa, conforme o fechamento do cartão." delay={120}>
          <div className="rounded-xl bg-[linear-gradient(135deg,var(--accent),color-mix(in_oklab,var(--accent)_45%,#000))] p-3 text-[0.6875rem] text-accent-ink">
            <p className="opacity-80">Fatura aberta</p>
            <p className="mt-0.5 text-sm font-semibold">R$ 780,00</p>
          </div>
        </Card>

        <Card className="md:col-span-2 lg:col-span-2" icon={Layers} title="Parcelamentos" text="Compras parceladas distribuídas pelas próximas faturas." delay={60}>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className="h-6 flex-1 rounded-md" style={{ background: i < 3 ? "var(--accent)" : "var(--surface-3)" }} />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-ink-3">3 de 10 pagas</p>
        </Card>

        <Card className="md:col-span-2 lg:col-span-2" icon={Repeat} title="Assinaturas e renda fixa" text="Streaming, apps, salário e mensalidades de clientes entram sozinhos nas datas certas." delay={120}>
          <div className="flex flex-wrap gap-1.5 text-[0.6875rem]">
            {["Streaming · mensal", "Salário · dia 5", "Cliente · dia 20"].map((t) => (
              <span key={t} className="rounded-full border border-border bg-field/50 px-2.5 py-1 text-ink-2">{t}</span>
            ))}
          </div>
        </Card>

        <Card className="md:col-span-2 lg:col-span-2" icon={Tags} title="Categorias" text="Crie e organize categorias, com cores, para entender para onde o dinheiro vai." delay={180}>
          <div className="flex h-3 overflow-hidden rounded-full">
            {[["var(--accent)", 38], ["var(--chart-expense)", 26], ["var(--chart-expected)", 20], ["var(--chart-income)", 16]].map(([c, w]) => (
              <span key={c as string} style={{ width: `${w}%`, background: c as string }} />
            ))}
          </div>
        </Card>

        <Card className="md:col-span-6 lg:col-span-6" icon={Smartphone} title="Do celular ao notebook" text="Navegação própria para telas pequenas e tema claro ou escuro, com várias paletas de cores para escolher." delay={60}>
          <div className="flex items-end gap-3">
            <span className="h-24 w-36 rounded-lg border border-border-strong bg-field/60 p-2"><span className="block h-2 w-2/3 rounded bg-surface-3" /><span className="mt-2 block h-10 rounded bg-accent-soft" /></span>
            <span className="h-20 w-11 rounded-lg border border-border-strong bg-field/60 p-1.5"><span className="block h-1.5 w-2/3 rounded bg-surface-3" /><span className="mt-1.5 block h-8 rounded bg-accent-soft" /></span>
            <Receipt className="mb-1 size-5 text-ink-3" aria-hidden />
          </div>
        </Card>
      </ul>
    </section>
  );
}
