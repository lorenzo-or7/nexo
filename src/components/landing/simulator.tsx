"use client";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";
import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";
import { clampDay, clampMoney, describeResult, parseMoneyText, SIM_DAYS, SIM_DEFAULTS, SIM_LIMITS, simulate, type SimInput } from "@/lib/landing/simulation";
import { areaFrom, scale, stepPath } from "./mini-chart";
import { Reveal } from "./reveal";
import { useAnimatedNumber } from "./use-animated-number";

const reais = (n: number) => formatBRL((n * 100) as Cents);

function MoneyControl({ id, label, value, onChange, max, tone }: { id: string; label: string; value: number; onChange: (v: number) => void; max: number; tone: string }) {
  const [text, setText] = React.useState(() => String(value));
  const focused = React.useRef(false);
  React.useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`${id}-n`} className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <span aria-hidden className="size-2 rounded-full" style={{ background: tone }} />
          {label}
        </label>
        <div className="flex h-10 w-36 items-center rounded-[var(--radius-control)] border border-border-strong bg-field px-3 focus-within:border-accent">
          <span aria-hidden className="mr-1 text-sm text-ink-3">R$</span>
          <input
            id={`${id}-n`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={text}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              focused.current = false;
              setText(String(value));
            }}
            onChange={(e) => {
              const v = parseMoneyText(e.target.value);
              // mostra o valor já contido nos limites (ex.: 9999999 vira 1000000); vazio continua vazio
              setText(/\d/.test(e.target.value) ? String(v) : "");
              onChange(v);
            }}
            className="w-full bg-transparent text-right text-[0.9375rem] font-medium tabular-nums outline-none"
          />
        </div>
      </div>
      <input
        id={`${id}-r`}
        type="range"
        min={SIM_LIMITS.min}
        max={max}
        step={100}
        value={Math.min(value, max)}
        onChange={(e) => onChange(clampMoney(e.target.value))}
        aria-label={`${label}, deslize para ajustar`}
        aria-valuetext={reais(value)}
        className="sim-range"
        style={{ ["--pct" as string]: `${(Math.min(value, max) / max) * 100}%`, ["--tone" as string]: tone }}
      />
    </div>
  );
}

function DayControl({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="flex items-center justify-between text-sm text-ink-2">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-ink">dia {value}</span>
      </label>
      <input id={id} type="range" min={1} max={SIM_DAYS} step={1} value={value} onChange={(e) => onChange(clampDay(e.target.value))} aria-valuetext={`dia ${value} dos próximos 30`} className="sim-range" style={{ ["--pct" as string]: `${((value - 1) / (SIM_DAYS - 1)) * 100}%`, ["--tone" as string]: "var(--accent)" }} />
    </div>
  );
}

function Trajectory({ input, result }: { input: SimInput; result: ReturnType<typeof simulate> }) {
  const W = 560;
  const H = 240;
  const values = result.series.map((p) => Number(p.balance) / 100);
  const lo = Math.min(...values, 0);
  const hi = Math.max(...values, 0);
  const { x, y } = scale(values, W, H, 14, [lo, hi === lo ? hi + 1 : hi]);
  const line = stepPath(values, x, y);
  const zeroY = y(0);
  const incomeDay = clampDay(input.incomeDay);
  const expenseDay = clampDay(input.expenseDay);
  const negative = lo < 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Trajetória hipotética do saldo em 30 dias, de ${reais(result.series[0].balance / 100)} a ${reais(result.final / 100)}`}>
      <defs>
        <linearGradient id="lp-sim-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="lp-sim-pos"><rect x="0" y="0" width={W} height={Math.max(0, zeroY)} /></clipPath>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1="0" x2={W} y1={H * t} y2={H * t} stroke="var(--chart-grid)" strokeDasharray="3 5" />
      ))}
      {negative && <rect x="0" y={zeroY} width={W} height={Math.max(0, H - zeroY)} fill="var(--negative)" opacity="0.08" />}
      <line x1="0" x2={W} y1={zeroY} y2={zeroY} stroke="var(--border-strong)" />
      <g clipPath="url(#lp-sim-pos)"><path d={areaFrom(line, W, zeroY)} fill="url(#lp-sim-fill)" /></g>
      <path d={line} fill="none" stroke={negative ? "var(--negative)" : "var(--accent)"} strokeWidth="2.5" strokeLinejoin="round" style={{ transition: "d 400ms" }} />
      {[
        { day: incomeDay, color: "var(--chart-income)", label: "Receita" },
        { day: expenseDay, color: "var(--chart-expense)", label: "Despesa" },
      ].map((e) => (
        <g key={e.label}>
          <circle cx={x(e.day)} cy={y(values[e.day])} r="5.5" fill={e.color} stroke="var(--surface)" strokeWidth="2.5" />
        </g>
      ))}
      <text x="0" y={H - 1} fontSize="11" fill="var(--ink-3)">hoje</text>
      <text x={W} y={H - 1} fontSize="11" fill="var(--ink-3)" textAnchor="end">dia 30</text>
    </svg>
  );
}

export function Simulator() {
  const [input, setInput] = React.useState<SimInput>({ ...SIM_DEFAULTS });
  const set = (patch: Partial<SimInput>) => setInput((s) => ({ ...s, ...patch }));
  const result = React.useMemo(() => simulate(input), [input]);
  const animatedFinal = useAnimatedNumber(result.final);
  const message = describeResult(result);

  const Icon = result.status === "up" ? TrendingUp : result.status === "down" ? TrendingDown : Minus;
  const tone = result.status === "up" ? "text-positive" : result.status === "down" ? "text-negative" : "text-ink-2";
  const label = result.status === "up" ? "Crescimento" : result.status === "down" ? "Redução" : "Sem alteração";

  return (
    <Reveal className="panel mx-auto mt-12 max-w-5xl overflow-hidden rounded-[1.75rem] p-5 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <form onSubmit={(e) => e.preventDefault()} className="grid content-start gap-6" aria-label="Simulador de saldo em 30 dias">
          <MoneyControl id="sim-initial" label="Saldo inicial" value={input.initial} onChange={(v) => set({ initial: v })} max={50_000} tone="var(--accent)" />
          <MoneyControl id="sim-income" label="Receitas previstas" value={input.income} onChange={(v) => set({ income: v })} max={20_000} tone="var(--chart-income)" />
          <MoneyControl id="sim-expense" label="Despesas previstas" value={input.expense} onChange={(v) => set({ expense: v })} max={20_000} tone="var(--chart-expense)" />

          <fieldset className="grid gap-4 rounded-2xl border border-border bg-field/40 p-4">
            <legend className="px-1 text-sm font-medium text-ink-2">Quando acontecem (opcional)</legend>
            <DayControl id="sim-income-day" label="Recebimento" value={input.incomeDay} onChange={(v) => set({ incomeDay: v })} />
            <DayControl id="sim-expense-day" label="Pagamento" value={input.expenseDay} onChange={(v) => set({ expenseDay: v })} />
            <p className="text-xs leading-relaxed text-ink-3">Hipótese: tudo cai de uma vez no dia escolhido. Mudar o dia não altera o saldo final, só o caminho até ele.</p>
          </fieldset>
        </form>

        <div className="grid content-start gap-5">
          <div>
            <p className="text-sm text-ink-2">Saldo final estimado em 30 dias</p>
            <p className={cn("mt-1 text-[clamp(2.25rem,7vw,3.5rem)] font-semibold leading-none tracking-[-0.05em] tabular-nums", result.final < 0 ? "text-negative" : "text-hero")}>
              {formatBRL(animatedFinal as Cents)}
            </p>
            <p className={cn("mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-field/60 px-3 py-1.5 text-sm font-medium", tone)}>
              <Icon className="size-4" aria-hidden />
              {label}
              {result.status !== "flat" && <span className="tabular-nums">{result.status === "up" ? "+" : "−"} {formatBRL(Math.abs(result.delta) as Cents)}</span>}
            </p>
          </div>

          <Trajectory input={input} result={result} />

          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-3" aria-label="Legenda">
            <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: "var(--chart-income)" }} />recebimento (dia {input.incomeDay})</li>
            <li className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: "var(--chart-expense)" }} />pagamento (dia {input.expenseDay})</li>
          </ul>

          <p role="status" aria-live="polite" className={cn("rounded-xl px-4 py-3 text-sm leading-relaxed", result.firstNegativeDay !== null ? "bg-accent-soft text-negative" : "bg-field/60 text-ink-2")}>
            {message}
          </p>
        </div>
      </div>
      <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-ink-3">
        Exemplo educativo e simplificado: saldo final = saldo inicial + receitas − despesas. Nada do que você digita aqui é enviado ou salvo, e não precisa de conta. No NEXO, a projeção usa as datas reais dos seus lançamentos, faturas e assinaturas.
      </p>
    </Reveal>
  );
}
