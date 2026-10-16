"use client";
import * as React from "react";
import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";
import { areaFrom, scale, stepPath } from "./mini-chart";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section";

/**
 * Visão limitada do painel com dados fictícios e fixos. Tudo é leitura: nada aqui salva ou consulta dados.
 */
interface Ev { day: number; amount: number; name: string; expected?: boolean; category?: string }
const START = 1800;
const DAYS = 30;
const EVENTS: Ev[] = [
  { day: 2, amount: -320, name: "Mercado", category: "Mercado" },
  { day: 5, amount: 4200, name: "Salário" },
  { day: 6, amount: -1450, name: "Aluguel", category: "Moradia" },
  { day: 9, amount: -89, name: "Assinaturas", category: "Lazer" },
  { day: 12, amount: -780, name: "Fatura do cartão", category: "Cartão" },
  { day: 15, amount: 1800, name: "Cliente (previsto)", expected: true },
  { day: 18, amount: -240, name: "Transporte", category: "Transporte" },
  { day: 21, amount: -430, name: "Mercado", category: "Mercado" },
  { day: 25, amount: -150, name: "Saúde", category: "Saúde" },
  { day: 27, amount: -510, name: "Contas da casa", category: "Moradia" },
  { day: 28, amount: 1800, name: "Cliente (previsto)", expected: true },
];

function balances(withExpected: boolean) {
  const out: number[] = [];
  let b = START;
  for (let d = 0; d <= DAYS; d++) {
    for (const e of EVENTS) if (e.day === d && (withExpected || !e.expected)) b += e.amount;
    out.push(b);
  }
  return out;
}

const TABS = [
  { id: "saldo", label: "Saldo" },
  { id: "fluxo", label: "Entradas e saídas" },
  { id: "categorias", label: "Categorias" },
] as const;
type Tab = (typeof TABS)[number]["id"];
const brl = (n: number) => formatBRL(Math.round(n * 100) as Cents);

function SaldoChart({ expected }: { expected: boolean }) {
  const W = 640;
  const H = 220;
  const data = React.useMemo(() => balances(expected), [expected]);
  const lo = Math.min(...data, 0);
  const hi = Math.max(...data);
  const { x, y } = scale(data, W, H, 16, [lo, hi]);
  const line = stepPath(data, x, y);
  const [hover, setHover] = React.useState<number | null>(null);
  const lowest = data.indexOf(Math.min(...data));
  const dayEvents = hover === null ? [] : EVENTS.filter((e) => e.day === hover && (expected || !e.expected));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(DAYS, Math.round(((e.clientX - r.left) / r.width) * DAYS))));
  };

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y overflow-visible"
        role="img"
        aria-label={`Projeção fictícia do saldo em 30 dias, de ${brl(data[0])} a ${brl(data[DAYS])}. Menor saldo: ${brl(data[lowest])} no dia ${lowest}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="lp-demo-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.2, 0.4, 0.6, 0.8].map((t) => <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="var(--chart-grid)" strokeDasharray="3 5" />)}
        <path d={areaFrom(line, W, H)} fill="url(#lp-demo-fill)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {EVENTS.filter((e) => e.amount > 0 && (expected || !e.expected)).map((e) => (
          <circle key={`${e.day}-${e.name}`} cx={x(e.day)} cy={y(data[e.day])} r="5" fill={e.expected ? "var(--chart-expected)" : "var(--chart-income)"} stroke="var(--surface)" strokeWidth="2.5" />
        ))}
        <circle cx={x(lowest)} cy={y(data[lowest])} r="5.5" fill="var(--surface)" stroke="var(--warning)" strokeWidth="2.5" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--border-strong)" />
            <circle cx={x(hover)} cy={y(data[hover])} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      <div className="mt-3 flex min-h-[3.5rem] flex-wrap items-center gap-x-6 gap-y-1 text-sm" aria-live="off">
        {hover === null ? (
          <p className="text-ink-3">Passe o mouse (ou o dedo) sobre o gráfico para ver cada dia.</p>
        ) : (
          <>
            <p><span className="text-ink-3">Dia {hover}:</span> <strong className="tabular-nums">{brl(data[hover])}</strong></p>
            {dayEvents.map((e) => (
              <p key={e.name + e.day} className="text-ink-2">{e.amount > 0 ? "+" : "−"} {brl(Math.abs(e.amount))} · {e.name}</p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function FluxoChart() {
  const W = 640;
  const H = 240;
  const weeks = [0, 1, 2, 3, 4].map((w) => {
    const inW = EVENTS.filter((e) => e.amount > 0 && Math.ceil(e.day / 7) - 1 === w).reduce((s, e) => s + e.amount, 0);
    const outW = EVENTS.filter((e) => e.amount < 0 && Math.ceil(e.day / 7) - 1 === w).reduce((s, e) => s - e.amount, 0);
    return { w, inW, outW };
  });
  const max = Math.max(...weeks.flatMap((x) => [x.inW, x.outW]));
  const bw = 44;
  const gap = (W - weeks.length * bw * 2) / (weeks.length + 1);
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="h-auto w-full" role="img" aria-label="Entradas e saídas fictícias por semana do mês">
      {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="var(--chart-grid)" strokeDasharray="3 5" />)}
      {weeks.map(({ w, inW, outW }, i) => {
        const x0 = gap + i * (bw * 2 + gap);
        const hIn = (inW / max) * (H - 20);
        const hOut = (outW / max) * (H - 20);
        return (
          <g key={w}>
            <rect x={x0} y={H - hIn} width={bw} height={hIn} rx="6" fill="var(--chart-income)" />
            <rect x={x0 + bw + 4} y={H - hOut} width={bw - 4} height={hOut} rx="6" fill="var(--chart-expense)" />
            <text x={x0 + bw} y={H + 18} textAnchor="middle" fontSize="12" fill="var(--ink-3)">Semana {w + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CategoriasChart() {
  const totals = new Map<string, number>();
  for (const e of EVENTS) if (e.amount < 0 && e.category) totals.set(e.category, (totals.get(e.category) ?? 0) - e.amount);
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((s, [, v]) => s + v, 0);
  const colors = ["var(--accent)", "var(--chart-expense)", "var(--chart-expected)", "var(--chart-income)", "var(--warning)", "var(--ink-3)"];
  return (
    <ul className="grid gap-3.5" aria-label="Despesas fictícias por categoria">
      {rows.map(([name, v], i) => (
        <li key={name}>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full" style={{ background: colors[i % colors.length] }} />{name}</span>
            <span className="tabular-nums text-ink-2">{brl(v)} · {Math.round((v / sum) * 100)}%</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-3"><div className="h-2.5 rounded-full transition-[width] duration-500" style={{ width: `${(v / rows[0][1]) * 100}%`, background: colors[i % colors.length] }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function ProductDemo() {
  const [tab, setTab] = React.useState<Tab>("saldo");
  const [expected, setExpected] = React.useState(true);
  const lowestWith = Math.min(...balances(true));
  const lowestWithout = Math.min(...balances(false));
  return (
    <div className="mx-auto mt-24 max-w-5xl">
      <SectionHeading id="titulo-painel" eyebrow="O painel por dentro" title="Do saldo de hoje ao fim do mês." subtitle="Uma amostra do painel com dados fictícios. É só para olhar: nada aqui salva informações." />
      <Reveal className="panel mt-10 overflow-hidden rounded-[1.75rem] p-5 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="tablist" aria-label="Visualizações do painel" className="inline-flex max-w-full rounded-full border border-border bg-field/60 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls="painel-demo"
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  const i = TABS.findIndex((x) => x.id === tab);
                  if (e.key === "ArrowRight") setTab(TABS[(i + 1) % TABS.length].id);
                  if (e.key === "ArrowLeft") setTab(TABS[(i + TABS.length - 1) % TABS.length].id);
                }}
                className={cn("min-h-10 whitespace-nowrap rounded-full px-3 text-sm font-medium transition-colors sm:px-4", tab === t.id ? "bg-accent text-accent-ink" : "text-ink-2 hover:text-ink")}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "saldo" && (
            <button
              type="button"
              role="switch"
              aria-checked={expected}
              onClick={() => setExpected((v) => !v)}
              className="inline-flex min-h-10 items-center gap-2.5 rounded-full border border-border-strong bg-field/60 px-3.5 text-sm"
            >
              <span aria-hidden className={cn("relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors", expected ? "bg-[var(--chart-expected)]" : "bg-surface-3")}>
                <span className={cn("absolute left-0 top-0.5 size-4 rounded-full bg-white shadow transition-transform", expected ? "translate-x-[1.125rem]" : "translate-x-0.5")} />
              </span>
              Receitas previstas
            </button>
          )}
        </div>

        <div id="painel-demo" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6">
          {tab === "saldo" && (
            <>
              <SaldoChart expected={expected} />
              <p className="mt-2 text-sm text-ink-2">
                {expected
                  ? `Contando os dois recebimentos previstos de clientes, o menor saldo do mês é ${brl(lowestWith)}.`
                  : `Só com o que já foi confirmado, o menor saldo do mês é ${brl(lowestWithout)}. Ligue as receitas previstas para ver a diferença.`}
              </p>
            </>
          )}
          {tab === "fluxo" && <FluxoChart />}
          {tab === "categorias" && <CategoriasChart />}
        </div>
      </Reveal>
    </div>
  );
}
