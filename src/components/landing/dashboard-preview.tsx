import { ArrowDownLeft, ArrowUpRight, CreditCard } from "lucide-react";
import { areaFrom, scale, stepPath } from "./mini-chart";

/**
 * Prévia do painel com dados 100% fictícios e estáticos: usa o mesmo visual do painel real
 * (painéis, tokens e tipografia), mas não consulta nada nem importa os componentes do app.
 */
const BALANCE = [1800, 1800, 1480, 1480, 1480, 5680, 5680, 4230, 4230, 4140, 4140, 4140, 3360, 3360, 3360, 5160, 5160, 5160, 4920, 4920, 4490, 4490, 4490, 4490, 4340, 4340, 3830, 5630, 5630, 5630];

export function DashboardPreview() {
  const W = 520;
  const H = 150;
  const { x, y } = scale(BALANCE, W, H, 10);
  const line = stepPath(BALANCE, x, y);
  const lowestIdx = BALANCE.indexOf(Math.min(...BALANCE));
  return (
    <div
      role="img"
      aria-label="Prévia do painel do NEXO com dados fictícios: saldo livre para gastar, projeção do saldo no mês, entradas e saídas previstas e fatura do cartão."
      className="panel relative isolate overflow-hidden rounded-[1.5rem] p-4 text-left sm:p-5"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-28 -z-10 size-[22rem] rounded-full bg-[radial-gradient(closest-side,var(--glow-1),transparent)]" />
      <div aria-hidden className="select-none">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold tracking-tight">Visão geral</p>
          <div className="flex gap-1 rounded-full border border-border bg-field/60 p-0.5 text-[0.6875rem] text-ink-3">
            <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-accent-ink">Até o fim do mês</span>
            <span className="px-2 py-1">30 dias</span>
            <span className="hidden px-2 py-1 sm:inline">90 dias</span>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="rounded-2xl border border-border bg-surface/70 p-4">
            <p className="flex items-center gap-2 text-xs text-ink-2">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
              Livre para gastar até 31/10
            </p>
            <p className="text-hero mt-1.5 text-[2.25rem] font-semibold leading-none tracking-[-0.05em] sm:text-[2.75rem]">R$ 3.830,00</p>
            <div className="mt-3 flex gap-2 text-[0.6875rem]">
              <div className="rounded-lg border border-border bg-field/50 px-2.5 py-1.5">
                <p className="text-ink-3">Menor saldo · 27/10</p>
                <p className="mt-0.5 font-semibold">R$ 3.830,00</p>
              </div>
              <div className="rounded-lg border border-border bg-field/50 px-2.5 py-1.5">
                <p className="text-ink-3">Fim do período</p>
                <p className="mt-0.5 font-semibold">R$ 5.630,00</p>
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lp-prev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--accent)" stopOpacity="0.32" />
                  <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((t) => (
                <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="var(--chart-grid)" strokeDasharray="3 5" />
              ))}
              <path d={areaFrom(line, x(BALANCE.length - 1), H)} fill="url(#lp-prev-fill)" />
              <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinejoin="round" />
              <circle cx={x(5)} cy={y(BALANCE[5])} r="4" fill="var(--chart-expected)" stroke="var(--surface)" strokeWidth="2" />
              <circle cx={x(lowestIdx)} cy={y(BALANCE[lowestIdx])} r="4.5" fill="var(--surface)" stroke="var(--warning)" strokeWidth="2.25" />
            </svg>
          </div>

          <div className="grid gap-3">
            <div className="rounded-2xl border border-border bg-surface/70 p-4">
              <p className="text-xs text-ink-3">Saldo em conta hoje</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">R$ 1.800,00</p>
              <ul className="mt-3 grid gap-1.5 text-xs">
                <li className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-ink-2"><span className="size-2 rounded-full bg-accent" />Conta principal</span><span className="whitespace-nowrap font-medium">R$ 1.250,00</span></li>
                <li className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-ink-2"><span className="size-2 rounded-full bg-[var(--chart-expected)]" />Reserva</span><span className="whitespace-nowrap font-medium">R$ 550,00</span></li>
              </ul>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface/70 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[0.6875rem] text-ink-3"><span className="grid size-7 place-items-center rounded-lg bg-positive-soft text-positive"><ArrowDownLeft className="size-3.5" /></span>A receber</span>
                <span className="whitespace-nowrap text-sm font-semibold">R$ 3.600,00</span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface/70 px-3 py-2.5">
                <span className="flex items-center gap-2 text-[0.6875rem] text-ink-3"><span className="grid size-7 place-items-center rounded-lg bg-warning-soft text-warning"><ArrowUpRight className="size-3.5" /></span>A pagar</span>
                <span className="whitespace-nowrap text-sm font-semibold">R$ 2.040,00</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/70 px-4 py-3 text-xs">
          <span className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><CreditCard className="size-4" /></span>
            <span>
              <span className="block font-medium">Fatura do cartão</span>
              <span className="block text-ink-3">vence em 12/10 · 3 compras parceladas</span>
            </span>
          </span>
          <span className="font-semibold">R$ 780,00</span>
        </div>
      </div>
    </div>
  );
}
