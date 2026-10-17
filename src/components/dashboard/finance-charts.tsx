"use client";
import { BarChart3, ChartArea, ChartLine, ChartPie, Eye, EyeOff, Table2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Segmented, usePref } from "./segmented";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { ChartDay, DashboardModel } from "@/domain/dashboard";
import { formatDateBR } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";

type View = "saldo" | "fluxo" | "categorias" | "receber" | "pagar";
type SaldoStyle = "area" | "bars";
type FluxoStyle = "grouped" | "stacked" | "lines";
type CatStyle = "donut" | "bars";

const C = {
  income: "var(--chart-income)",
  expected: "var(--chart-expected)",
  expense: "var(--chart-expense)",
  balance: "var(--accent)",
  muted: "var(--ink-3)",
  positive: "var(--positive)",
  negative: "var(--negative)",
  /** contas fixas e assinaturas */
  recurring: "var(--warning)",
};

/** acima de tudo (inclusive do texto no centro da rosca) e opaco */
const TIP_STYLE = { zIndex: 60, outline: "none" } as const;

const brl = (v: number) => formatBRL(Math.round(v * 100) as Cents);
const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const compact = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : Math.round(v).toLocaleString("pt-BR");

/**
 * Escala "redonda" que sempre inclui o zero como um dos marcadores do eixo,
 * para a linha fixa do zero cair exatamente em cima do "0".
 */
function niceScale(lo: number, hi: number, target = 5) {
  const min = Math.min(lo, 0);
  const max = Math.max(hi, 0);
  const span = max - min || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(min / step + 1e-9) * step;
  const end = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] as [number, number] };
}

function Swatch({ color, hatched, line }: { color: string; hatched?: boolean; line?: boolean }) {
  if (line) return <span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: color }} />;
  return (
    <span
      aria-hidden
      className="inline-block size-3 rounded-[4px] border"
      style={{
        borderColor: color,
        background: hatched ? `repeating-linear-gradient(45deg, ${color} 0 2px, transparent 2px 5px)` : color,
      }}
    />
  );
}

function Tip({ p, render }: { p: TooltipContentProps; render: (row: Record<string, unknown>) => ReactNode }) {
  if (!p.active || !p.payload?.length) return null;
  const row = p.payload[0].payload as Record<string, unknown>;
  return (
    <div className="min-w-48 whitespace-nowrap rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
      <p className="mb-1.5 font-medium text-ink">{String(row.title ?? "")}</p>
      <div className="grid gap-1">{render(row)}</div>
    </div>
  );
}

function TipRow({ color, label, value, hatched, line }: { color: string; label: string; value: string; hatched?: boolean; line?: boolean }) {
  return (
    <p className="flex items-center justify-between gap-4 text-ink-2">
      <span className="flex items-center gap-2">
        <Swatch color={color} hatched={hatched} line={line} />
        {label}
      </span>
      <span className="tabular font-medium text-ink">{value}</span>
    </p>
  );
}

interface Bucket {
  key: string;
  title: string;
  label: string;
  incomeConfirmed: number;
  incomeExpected: number;
  expenses: number;
  outInvoices: number;
  outRecurring: number;
  outOther: number;
  balanceAll: number;
  balanceConfirmed: number;
  /** soma do período inteiro até aqui (para as visões "A receber" e "A pagar") */
  cumIncomeConfirmed: number;
  cumIncomeExpected: number;
  cumExpenses: number;
}

/** Agrupa por semana quando o período é longo (60/90 dias): barras diárias ficariam finas demais. */
function bucketize(days: ChartDay[]) {
  const weekly = days.length > 14;
  const size = weekly ? 7 : 1;
  const out: Bucket[] = [];
  let cc = 0;
  let ce = 0;
  let cx = 0;
  for (let i = 0; i < days.length; i += size) {
    const chunk = days.slice(i, i + size);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const total = (f: (d: ChartDay) => number) => chunk.reduce((t, d) => t + f(d), 0);
    const b: Bucket = {
      key: first.date,
      title: weekly ? `${formatDateBR(first.date)} a ${formatDateBR(last.date)}` : formatDateBR(first.date),
      label: short(first.date),
      incomeConfirmed: total((d) => d.incomeConfirmed),
      incomeExpected: total((d) => d.incomeExpected),
      expenses: total((d) => d.expenses),
      outInvoices: total((d) => d.outInvoices),
      outRecurring: total((d) => d.outRecurring),
      outOther: total((d) => d.outOther),
      balanceAll: last.balanceAll,
      balanceConfirmed: last.balanceConfirmed,
      cumIncomeConfirmed: 0,
      cumIncomeExpected: 0,
      cumExpenses: 0,
    };
    cc += b.incomeConfirmed;
    ce += b.incomeExpected;
    cx += b.expenses;
    b.cumIncomeConfirmed = cc;
    b.cumIncomeExpected = ce;
    b.cumExpenses = cx;
    out.push(b);
  }
  return { rows: out, weekly };
}

export function FinanceCharts({
  model,
  showExpected,
  onShowExpectedChange,
}: {
  model: DashboardModel;
  /** compartilhado com o destaque da tela: o saldo conta as receitas previstas? */
  showExpected: boolean;
  onShowExpectedChange: (v: boolean) => void;
}) {
  const { chart, byCategory } = model;
  const [view, setView] = usePref<View>("chart-view", "saldo", ["saldo", "fluxo", "categorias", "receber", "pagar"]);
  const [saldoStyle, setSaldoStyle] = usePref<SaldoStyle>("chart-saldo", "area", ["area", "bars"]);
  const [fluxoStyle, setFluxoStyle] = usePref<FluxoStyle>("chart-fluxo", "grouped", ["grouped", "stacked", "lines"]);
  const [catStyle, setCatStyle] = usePref<CatStyle>("chart-cat", "donut", ["donut", "bars"]);
  const [showIncome, setShowIncome] = useState(true);
  const [showExpenses, setShowExpenses] = useState(true);
  const [table, setTable] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const hasExpected = chart.expectedIncome.length > 0;
  const expectedTotal = chart.expectedIncome.reduce((t, e) => t + e.amount, 0);
  const buckets = useMemo(() => bucketize(chart.days), [chart.days]);
  const reserve = model.totals.reserve / 100;

  const saldoData = useMemo(() => {
    const rows = chart.days.map((d) => {
      const main = showExpected ? d.balanceAll : d.balanceConfirmed;
      return { ...d, title: formatDateBR(d.date), main, marker: showExpected && d.incomeExpected > 0 ? main : null, minMarker: null as number | null };
    });
    // marca o dia do menor saldo (o "gargalo" que define quanto dá para gastar)
    if (rows.length > 1) {
      const minIdx = rows.reduce((m, d, i) => (d.main < rows[m].main ? i : m), 0);
      rows[minIdx].minMarker = rows[minIdx].main;
    }
    return rows;
  }, [chart.days, showExpected]);
  const minBalance = Math.min(0, ...saldoData.map((d) => d.main));
  const maxBalance = Math.max(0, ...saldoData.map((d) => d.main));
  /** escala e zonas consideram tudo o que está desenhado, inclusive a linha tracejada do confirmado */
  const showConfirmedLine = showExpected && hasExpected;
  const visValues = saldoData.flatMap((d) => (showConfirmedLine ? [d.main, d.balanceConfirmed] : [d.main]));
  const visMin = Math.min(0, ...visValues);
  const visMax = Math.max(0, ...visValues);
  const saldoScale = niceScale(visMin, visMax);
  /** onde o zero cai na altura do desenho (0 = topo, 1 = base): só existe quando o saldo cruza o zero */
  const zeroSplit = maxBalance > 0 && minBalance < 0 ? maxBalance / (maxBalance - minBalance) : null;

  /** "A receber": soma acumulada dia a dia, separando o confirmado do apenas previsto */
  const receberData = useMemo(() => {
    let c = 0;
    let e = 0;
    return chart.days.map((d) => {
      c += d.incomeConfirmed;
      e += d.incomeExpected;
      return { date: d.date, title: formatDateBR(d.date), cumConfirmed: c, cumExpected: e, cumTotal: c + e, incomeConfirmed: d.incomeConfirmed, incomeExpected: d.incomeExpected, items: d.items.filter((i) => i.amount > 0) };
    });
  }, [chart.days]);
  const receberTotal = receberData.at(-1) ?? { cumConfirmed: 0, cumExpected: 0, cumTotal: 0 };
  const nextReceipt = receberData.find((d) => d.incomeConfirmed + d.incomeExpected > 0);
  const pagarTotals = useMemo(
    () => ({
      invoices: buckets.rows.reduce((t, b) => t + b.outInvoices, 0),
      recurring: buckets.rows.reduce((t, b) => t + b.outRecurring, 0),
      other: buckets.rows.reduce((t, b) => t + b.outOther, 0),
      total: buckets.rows.reduce((t, b) => t + b.expenses, 0),
    }),
    [buckets.rows],
  );

  const catTotal = byCategory.reduce((t, c) => t + c.amount, 0);
  const catRows = useMemo(() => {
    const top = byCategory.slice(0, 7).map((c) => ({ name: c.name, value: c.amount / 100, color: c.color, pct: catTotal ? Math.round((c.amount / catTotal) * 100) : 0 }));
    const rest = byCategory.slice(7).reduce((t, c) => t + c.amount, 0);
    if (rest > 0) top.push({ name: "Outras", value: rest / 100, color: "#5C677D", pct: catTotal ? Math.round((rest / catTotal) * 100) : 0 });
    return top;
  }, [byCategory, catTotal]);

  const fluxoTotals = useMemo(() => {
    const conf = buckets.rows.reduce((t, b) => t + b.incomeConfirmed, 0);
    const exp = buckets.rows.reduce((t, b) => t + b.incomeExpected, 0);
    const out = buckets.rows.reduce((t, b) => t + b.expenses, 0);
    return { conf, exp, out, net: conf + (showExpected ? exp : 0) - out };
  }, [buckets.rows, showExpected]);

  const grid = <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 6" />;
  const axisTick = { fill: "var(--ink-3)", fontSize: 12 };
  const margin = { top: 8, right: 4, left: 4, bottom: 0 };

  const description =
    view === "saldo"
      ? `Saldo projetado de ${formatDateBR(chart.days[0].date)} a ${formatDateBR(chart.days.at(-1)!.date)}`
      : view === "fluxo"
        ? `Receitas e saídas ${buckets.weekly ? "por semana" : "por dia"} de ${formatDateBR(chart.days[0].date)} a ${formatDateBR(chart.days.at(-1)!.date)}`
        : view === "receber"
          ? `Total a receber acumulado de ${formatDateBR(chart.days[0].date)} a ${formatDateBR(chart.days.at(-1)!.date)}`
          : view === "pagar"
            ? `Saídas ${buckets.weekly ? "por semana" : "por dia"} de ${formatDateBR(chart.days[0].date)} a ${formatDateBR(chart.days.at(-1)!.date)}, por origem`
            : "Despesas do mês por categoria";

  const expectedToggle = (
    <button
      type="button"
      aria-pressed={showExpected}
      onClick={() => onShowExpectedChange(!showExpected)}
      disabled={!hasExpected}
      title={hasExpected ? undefined : "Nenhuma receita prevista no período"}
      className={cn(
        "inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        showExpected && hasExpected ? "border-[var(--chart-expected)] text-ink" : "border-border text-ink-2 hover:text-ink",
      )}
    >
      {showExpected && hasExpected ? <Eye className="size-4" style={{ color: C.expected }} /> : <EyeOff className="size-4" />}
      Receitas previstas
    </button>
  );

  return (
    <div>
      {/* controles: aba, estilo do gráfico e filtro de receitas previstas */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Gráfico"
          value={view}
          onChange={(v) => { setView(v); setTable(false); }}
          options={[
            { key: "saldo", label: "Saldo" },
            { key: "fluxo", label: "Entradas e saídas", short: "Fluxo" },
            { key: "categorias", label: "Categorias" },
            { key: "receber", label: "A receber" },
            { key: "pagar", label: "A pagar" },
          ]}
        />
        {view === "saldo" && (
          <Segmented
            label="Estilo do gráfico de saldo"
            value={saldoStyle}
            onChange={setSaldoStyle}
            options={[
              { key: "area", label: "Área", icon: <ChartArea className="size-4" /> },
              { key: "bars", label: "Barras", icon: <BarChart3 className="size-4" /> },
            ]}
          />
        )}
        {view === "fluxo" && (
          <Segmented
            label="Estilo do gráfico de entradas e saídas"
            value={fluxoStyle}
            onChange={setFluxoStyle}
            options={[
              { key: "grouped", label: "Lado a lado", icon: <BarChart3 className="size-4" /> },
              { key: "stacked", label: "Empilhado", icon: <BarChart3 className="size-4" /> },
              { key: "lines", label: "Linhas", icon: <ChartLine className="size-4" /> },
            ]}
          />
        )}
        {view === "categorias" && (
          <Segmented
            label="Estilo do gráfico de categorias"
            value={catStyle}
            onChange={setCatStyle}
            options={[
              { key: "donut", label: "Rosca", icon: <ChartPie className="size-4" /> },
              { key: "bars", label: "Barras", icon: <BarChart3 className="size-4" /> },
            ]}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {(view === "saldo" || view === "fluxo") && expectedToggle}
          <button
            type="button"
            aria-pressed={table}
            onClick={() => setTable(!table)}
            className={cn("inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm transition-colors", table ? "border-accent text-ink" : "border-border text-ink-2 hover:text-ink")}
          >
            <Table2 className="size-4" />
            Tabela
          </button>
        </div>
      </div>

      {/* legenda (sempre visível; no fluxo os itens também filtram) */}
      <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
        {view === "saldo" && (
          <>
            <li className="flex items-center gap-2"><Swatch color={C.balance} />{showExpected && hasExpected ? "Saldo com previstas" : "Saldo previsto"}</li>
            <li className="flex items-center gap-2"><span aria-hidden className="inline-block h-0 w-4 border-t-2 border-solid" style={{ borderColor: "var(--ink-2)" }} />Linha do zero: acima positivo, abaixo negativo</li>
            <li className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full border-2" style={{ borderColor: minBalance < 0 ? "var(--negative)" : "var(--warning)" }} />Menor saldo</li>
            {showExpected && hasExpected && (
              <>
                <li className="flex items-center gap-2"><Swatch color={C.muted} line />Só o confirmado</li>
                <li className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full border-2 border-surface" style={{ background: C.expected, boxShadow: `0 0 0 1px ${C.expected}` }} />Dia de receita prevista</li>
              </>
            )}
          </>
        )}
        {view === "fluxo" && (
          <>
            <li>
              <button type="button" aria-pressed={showIncome} onClick={() => setShowIncome(!showIncome)} className={cn("flex items-center gap-2 transition-opacity", !showIncome && "opacity-40")}>
                <Swatch color={C.income} />Receitas confirmadas
              </button>
            </li>
            <li>
              <button type="button" aria-pressed={showExpected} onClick={() => hasExpected && onShowExpectedChange(!showExpected)} className={cn("flex items-center gap-2 transition-opacity", (!showExpected || !hasExpected) && "opacity-40")}>
                <Swatch color={C.expected} hatched />Receitas previstas
              </button>
            </li>
            <li>
              <button type="button" aria-pressed={showExpenses} onClick={() => setShowExpenses(!showExpenses)} className={cn("flex items-center gap-2 transition-opacity", !showExpenses && "opacity-40")}>
                <Swatch color={C.expense} />Saídas
              </button>
            </li>
          </>
        )}
        {view === "categorias" && <li className="text-ink-3">Consumo pela data da compra; pagamento de fatura não conta de novo.</li>}
        {view === "receber" && (
          <>
            <li className="flex items-center gap-2"><Swatch color={C.income} />Confirmado a receber</li>
            <li className="flex items-center gap-2"><Swatch color={C.expected} hatched />Previsto</li>
            <li className="text-ink-3">Soma acumulada: cada degrau é um recebimento.</li>
          </>
        )}
        {view === "pagar" && (
          <>
            <li className="flex items-center gap-2"><Swatch color={C.expense} />Faturas de cartão</li>
            <li className="flex items-center gap-2"><Swatch color={C.recurring} />Contas fixas e assinaturas</li>
            <li className="flex items-center gap-2"><Swatch color={C.muted} />Outras saídas</li>
          </>
        )}
      </ul>

      <div className="mt-3 min-w-0">
        {table ? (
          <DataTable view={view} saldo={saldoData} buckets={buckets} cats={catRows} receber={receberData} showExpected={showExpected && hasExpected} />
        ) : view === "saldo" ? (
          <div className="h-56 w-full sm:h-64" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={saldoData} margin={margin}>
                <defs>
                  <linearGradient id="nexo-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
                    <stop offset="70%" stopColor="var(--accent)" stopOpacity={0.05} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="nexo-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--brand-crimson)" />
                    <stop offset="100%" stopColor="var(--brand-rose)" />
                  </linearGradient>
                  {/* quando o saldo cruza o zero, acima e abaixo da linha ganham cores diferentes */}
                  {zeroSplit !== null && (
                    <>
                      <linearGradient id="nexo-line-split" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={0} stopColor="var(--accent)" />
                        <stop offset={zeroSplit} stopColor="var(--accent)" />
                        <stop offset={zeroSplit} stopColor="var(--negative)" />
                        <stop offset={1} stopColor="var(--negative)" />
                      </linearGradient>
                      <linearGradient id="nexo-area-split" x1="0" y1="0" x2="0" y2="1">
                        <stop offset={0} stopColor="var(--accent)" stopOpacity={0.34} />
                        <stop offset={zeroSplit} stopColor="var(--accent)" stopOpacity={0.06} />
                        <stop offset={zeroSplit} stopColor="var(--negative)" stopOpacity={0.06} />
                        <stop offset={1} stopColor="var(--negative)" stopOpacity={0.38} />
                      </linearGradient>
                    </>
                  )}
                </defs>
                {grid}
                <XAxis dataKey="date" tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis width={56} domain={saldoScale.domain} ticks={saldoScale.ticks} tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} />
                {/* zonas: acima do zero (saldo positivo) e abaixo (negativo) */}
                {visMax > 0 && <ReferenceArea y1={0} y2={saldoScale.domain[1]} fill="var(--positive)" fillOpacity={0.05} ifOverflow="hidden" />}
                {visMin < 0 && <ReferenceArea y1={saldoScale.domain[0]} y2={0} fill="var(--negative)" fillOpacity={0.1} ifOverflow="hidden" />}
                {/* linha fixa do zero: sempre visível, em qualquer tema, com os lados nomeados */}
                <ReferenceLine
                  y={0}
                  stroke="var(--ink-2)"
                  strokeOpacity={0.8}
                  strokeWidth={1.5}
                  ifOverflow="visible"
                  label={{
                    content: (props) => {
                      const vb = (props.viewBox ?? {}) as { x?: number; y?: number };
                      const x = (vb.x ?? 0) + 6;
                      const y = vb.y ?? 0;
                      const t = { fontSize: 11, fontWeight: 600, stroke: "var(--surface)", strokeWidth: 3, paintOrder: "stroke" as const };
                      return (
                        <g aria-hidden>
                          {visMax > 0 && <text x={x} y={y - 6} fill="var(--positive)" {...t}>▲ positivo</text>}
                          {visMin < 0 && <text x={x} y={y + 15} fill="var(--negative)" {...t}>▼ negativo</text>}
                        </g>
                      );
                    },
                  }}
                />
                {reserve > 0 && <ReferenceLine y={reserve} stroke="var(--warning)" strokeDasharray="2 4" />}
                <Tooltip
                  wrapperStyle={TIP_STYLE}
                  cursor={{ stroke: "var(--border-strong)" }}
                  content={(p) => (
                    <Tip
                      p={p}
                      render={(r) => (
                        <>
                          <TipRow color={C.balance} label={showExpected && hasExpected ? "Saldo com previstas" : "Saldo previsto"} value={brl(r.main as number)} />
                          {showExpected && hasExpected && (r.balanceAll as number) !== (r.balanceConfirmed as number) && (
                            <TipRow color={C.muted} line label="Só o confirmado" value={brl(r.balanceConfirmed as number)} />
                          )}
                          {(r.incomeExpected as number) > 0 && showExpected && <TipRow color={C.expected} label="Receita prevista" value={`+${brl(r.incomeExpected as number)}`} />}
                          {(r.incomeConfirmed as number) > 0 && <TipRow color={C.income} label="Entrada" value={`+${brl(r.incomeConfirmed as number)}`} />}
                          {(r.expenses as number) > 0 && <TipRow color={C.expense} label="Saídas" value={`-${brl(r.expenses as number)}`} />}
                          {(r.items as { label: string; amount: number }[]).length > 0 && (
                            <ul className="mt-1.5 grid gap-0.5 border-t border-border pt-1.5 text-xs text-ink-3">
                              {(r.items as { label: string; amount: number }[]).map((it, i) => (
                                <li key={i} className="flex items-center justify-between gap-4">
                                  <span className="max-w-40 truncate">{it.label}</span>
                                  <span className="tabular" style={{ color: it.amount > 0 ? C.income : C.expense }}>{it.amount > 0 ? "+" : "-"}{brl(Math.abs(it.amount))}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {r.minMarker != null && <p className="mt-1 text-xs text-warning">Menor saldo do período</p>}
                        </>
                      )}
                    />
                  )}
                />
                {saldoStyle === "area" && (
                  <Area
                    type="stepAfter"
                    dataKey="main"
                    name="Saldo"
                    baseValue={0}
                    stroke={zeroSplit !== null ? "url(#nexo-line-split)" : minBalance < 0 && maxBalance <= 0 ? "var(--negative)" : "url(#nexo-line)"}
                    strokeWidth={2.5}
                    fill={zeroSplit !== null ? "url(#nexo-area-split)" : minBalance < 0 && maxBalance <= 0 ? "var(--negative)" : "url(#nexo-area)"}
                    fillOpacity={zeroSplit === null && minBalance < 0 && maxBalance <= 0 ? 0.22 : 1}
                    isAnimationActive
                    animationDuration={600}
                    activeDot={{ r: 5, fill: "#f25c8d", stroke: "var(--surface)", strokeWidth: 2 }}
                  />
                )}
                {saldoStyle === "bars" && (
                  <Bar dataKey="main" name="Saldo" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive animationDuration={600}>
                    {saldoData.map((d) => (
                      <Cell key={d.date} fill={d.main < 0 ? "var(--negative)" : "var(--accent)"} fillOpacity={0.85} />
                    ))}
                  </Bar>
                )}
                {showExpected && hasExpected && (
                  <Line type="stepAfter" dataKey="balanceConfirmed" name="Só o confirmado" stroke={C.muted} strokeWidth={1.75} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
                )}
                {showExpected && hasExpected && (
                  <Line
                    dataKey="marker"
                    name="Receita prevista"
                    stroke="none"
                    isAnimationActive={false}
                    activeDot={false}
                    dot={(d: { cx?: number; cy?: number; index?: number }) =>
                      d.cx == null || d.cy == null ? <g key={d.index} /> : <circle key={d.index} cx={d.cx} cy={d.cy} r={5.5} fill={C.expected} stroke="var(--surface)" strokeWidth={2} />
                    }
                  />
                )}
                <Line
                  dataKey="minMarker"
                  name="Menor saldo"
                  stroke="none"
                  isAnimationActive={false}
                  activeDot={false}
                  dot={(d: { cx?: number; cy?: number; index?: number }) =>
                    d.cx == null || d.cy == null ? <g key={d.index} /> : <circle key={d.index} cx={d.cx} cy={d.cy} r={6} fill="var(--surface)" stroke={minBalance < 0 ? "var(--negative)" : "var(--warning)"} strokeWidth={2.5} />
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : view === "fluxo" ? (
          <div className="h-56 w-full sm:h-64" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={buckets.rows} margin={margin} barCategoryGap="22%">
                <defs>
                  <pattern id="nexo-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--chart-expected)" fillOpacity={0.22} />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-expected)" strokeWidth={3} />
                  </pattern>
                </defs>
                {grid}
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis width={56} tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} />
                <Tooltip
                  wrapperStyle={TIP_STYLE}
                  cursor={fluxoStyle === "lines" ? { stroke: "var(--border-strong)" } : { fill: "var(--surface-2)", fillOpacity: 0.5 }}
                  content={(p) => (
                    <Tip
                      p={p}
                      render={(r) => (
                        <>
                          {showIncome && <TipRow color={C.income} label="Receitas confirmadas" value={brl(r.incomeConfirmed as number)} />}
                          {showExpected && hasExpected && <TipRow color={C.expected} hatched label="Receitas previstas" value={brl(r.incomeExpected as number)} />}
                          {showExpenses && <TipRow color={C.expense} label="Saídas" value={brl(r.expenses as number)} />}
                        </>
                      )}
                    />
                  )}
                />
                {fluxoStyle === "lines" ? (
                  <>
                    {showIncome && <Line type="monotone" dataKey="incomeConfirmed" name="Receitas confirmadas" stroke={C.income} strokeWidth={2.5} dot={{ r: 3, fill: C.income, stroke: "var(--surface)", strokeWidth: 1.5 }} isAnimationActive={false} />}
                    {showExpected && hasExpected && <Line type="monotone" dataKey="incomeExpected" name="Receitas previstas" stroke={C.expected} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, fill: C.expected, stroke: "var(--surface)", strokeWidth: 1.5 }} isAnimationActive={false} />}
                    {showExpenses && <Line type="monotone" dataKey="expenses" name="Saídas" stroke={C.expense} strokeWidth={2.5} dot={{ r: 3, fill: C.expense, stroke: "var(--surface)", strokeWidth: 1.5 }} isAnimationActive={false} />}
                  </>
                ) : (
                  <>
                    {showIncome && <Bar dataKey="incomeConfirmed" name="Receitas confirmadas" stackId={fluxoStyle === "stacked" ? "in" : undefined} fill={C.income} radius={fluxoStyle === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />}
                    {showExpected && hasExpected && <Bar dataKey="incomeExpected" name="Receitas previstas" stackId={fluxoStyle === "stacked" ? "in" : undefined} fill="url(#nexo-hatch)" stroke={C.expected} strokeWidth={1.5} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />}
                    {showExpenses && <Bar dataKey="expenses" name="Saídas" stackId={fluxoStyle === "stacked" ? "out" : undefined} fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />}
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : view === "receber" ? (
          <div className="h-56 w-full sm:h-64" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={receberData} margin={margin}>
                <defs>
                  <pattern id="nexo-hatch-r" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="var(--chart-expected)" fillOpacity={0.22} />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="var(--chart-expected)" strokeWidth={3} />
                  </pattern>
                  <linearGradient id="nexo-income-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-income)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-income)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                {grid}
                <XAxis dataKey="date" tickFormatter={short} tick={axisTick} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis width={56} domain={[0, "auto"]} tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="var(--ink-2)" strokeOpacity={0.75} strokeWidth={1.5} />
                <Tooltip
                  wrapperStyle={TIP_STYLE}
                  cursor={{ stroke: "var(--border-strong)" }}
                  content={(p) => (
                    <Tip
                      p={p}
                      render={(r) => (
                        <>
                          <TipRow color={C.income} label="Confirmado até aqui" value={brl(r.cumConfirmed as number)} />
                          <TipRow color={C.expected} hatched label="Previsto até aqui" value={brl(r.cumExpected as number)} />
                          <p className="mt-0.5 flex items-center justify-between gap-4 border-t border-border pt-1.5 font-medium text-ink">
                            <span>Total a receber</span>
                            <span className="tabular">{brl(r.cumTotal as number)}</span>
                          </p>
                          {(r.items as { label: string; amount: number }[]).length > 0 && (
                            <ul className="mt-1.5 grid gap-0.5 border-t border-border pt-1.5 text-xs text-ink-3">
                              {(r.items as { label: string; amount: number }[]).map((it, i) => (
                                <li key={i} className="flex items-center justify-between gap-4">
                                  <span className="max-w-40 truncate">{it.label}</span>
                                  <span className="tabular" style={{ color: C.income }}>+{brl(it.amount)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    />
                  )}
                />
                <Area type="stepAfter" dataKey="cumConfirmed" stackId="r" name="Confirmado" stroke={C.income} strokeWidth={2} fill="url(#nexo-income-area)" isAnimationActive={false} activeDot={false} />
                <Area type="stepAfter" dataKey="cumExpected" stackId="r" name="Previsto" stroke={C.expected} strokeWidth={2} strokeDasharray="6 4" fill="url(#nexo-hatch-r)" isAnimationActive={false} activeDot={{ r: 5, fill: C.expected, stroke: "var(--surface)", strokeWidth: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : view === "pagar" ? (
          <div className="h-56 w-full sm:h-64" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={buckets.rows} margin={margin} barCategoryGap="22%">
                {grid}
                <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} minTickGap={20} />
                <YAxis width={56} domain={[0, "auto"]} tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="var(--ink-2)" strokeOpacity={0.75} strokeWidth={1.5} />
                <Tooltip
                  wrapperStyle={TIP_STYLE}
                  cursor={{ fill: "var(--surface-2)", fillOpacity: 0.5 }}
                  content={(p) => (
                    <Tip
                      p={p}
                      render={(r) => (
                        <>
                          <TipRow color={C.expense} label="Faturas de cartão" value={brl(r.outInvoices as number)} />
                          <TipRow color={C.recurring} label="Contas fixas e assinaturas" value={brl(r.outRecurring as number)} />
                          <TipRow color={C.muted} label="Outras saídas" value={brl(r.outOther as number)} />
                          <p className="mt-0.5 flex items-center justify-between gap-4 border-t border-border pt-1.5 text-ink-2">
                            <span>Total a pagar até aqui</span>
                            <span className="tabular font-medium text-ink">{brl(r.cumExpenses as number)}</span>
                          </p>
                        </>
                      )}
                    />
                  )}
                />
                <Bar dataKey="outInvoices" name="Faturas de cartão" stackId="p" fill={C.expense} maxBarSize={26} isAnimationActive={false} />
                <Bar dataKey="outRecurring" name="Contas fixas e assinaturas" stackId="p" fill={C.recurring} maxBarSize={26} isAnimationActive={false} />
                <Bar dataKey="outOther" name="Outras saídas" stackId="p" fill={C.muted} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : catRows.length === 0 ? (
          <p className="grid h-40 place-items-center text-sm text-ink-3">Nenhuma despesa neste mês ainda.</p>
        ) : catStyle === "donut" ? (
          <div className="grid items-center gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="relative mx-auto h-56 w-56" role="img" aria-label={description}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catRows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="94%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false} onMouseEnter={(_, i) => setActiveCat(catRows[i]?.name ?? null)} onMouseLeave={() => setActiveCat(null)}>
                    {catRows.map((c) => <Cell key={c.name} fill={c.color} fillOpacity={activeCat && activeCat !== c.name ? 0.3 : 1} style={{ cursor: "pointer", outline: "none" }} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
                {(() => {
                  const a = catRows.find((c) => c.name === activeCat);
                  return a ? (
                    <div className="max-w-[8rem]">
                      <p className="truncate text-xs font-medium" style={{ color: "var(--ink-2)" }}>{a.name}</p>
                      <p className="tabular text-lg font-semibold">{brl(a.value)}</p>
                      <p className="text-xs text-ink-3">{a.pct}% das despesas</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-ink-3">Despesas do mês</p>
                      <p className="tabular text-lg font-semibold">{brl(catTotal / 100)}</p>
                    </div>
                  );
                })()}
              </div>
            </div>
            <CatLegend rows={catRows} active={activeCat} onActive={setActiveCat} />
          </div>
        ) : (
          <div style={{ height: Math.max(180, catRows.length * 40 + 16) }} className="w-full" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={catRows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke="var(--chart-grid)" strokeDasharray="2 6" />
                <XAxis type="number" tickFormatter={compact} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={96} tick={{ fill: "var(--ink-2)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip wrapperStyle={TIP_STYLE} cursor={{ fill: "var(--surface-2)", fillOpacity: 0.5 }} content={(p) => <CatTip p={p} />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  {catRows.map((c) => <Cell key={c.name} fill={c.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {view === "fluxo" && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Receitas confirmadas", value: fluxoTotals.conf, color: C.income },
            { label: "Receitas previstas", value: fluxoTotals.exp, color: C.expected, hatched: true },
            { label: "Saídas", value: fluxoTotals.out, color: C.expense },
            { label: "Resultado do período", value: fluxoTotals.net, color: fluxoTotals.net < 0 ? "var(--negative)" : C.income },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-field/50 px-3 py-2.5">
              <dt className="flex items-center gap-2 text-xs text-ink-3"><Swatch color={k.color} hatched={k.hatched} />{k.label}</dt>
              <dd className="tabular mt-1 text-base font-semibold">{brl(k.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {view === "receber" && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total a receber", value: brl(receberTotal.cumTotal), color: C.income },
            { label: "Confirmado", value: brl(receberTotal.cumConfirmed), color: C.income },
            { label: "Previsto", value: brl(receberTotal.cumExpected), color: C.expected, hatched: true },
            { label: nextReceipt ? `Próximo recebimento · ${short(nextReceipt.date)}` : "Próximo recebimento", value: nextReceipt ? brl(nextReceipt.incomeConfirmed + nextReceipt.incomeExpected) : "nenhum", color: C.muted },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-field/50 px-3 py-2.5">
              <dt className="flex items-center gap-2 text-xs text-ink-3"><Swatch color={k.color} hatched={k.hatched} />{k.label}</dt>
              <dd className="tabular mt-1 text-base font-semibold">{k.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {view === "pagar" && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total a pagar", value: pagarTotals.total, color: C.negative },
            { label: "Faturas de cartão", value: pagarTotals.invoices, color: C.expense },
            { label: "Contas fixas e assinaturas", value: pagarTotals.recurring, color: C.recurring },
            { label: "Outras saídas", value: pagarTotals.other, color: C.muted },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-field/50 px-3 py-2.5">
              <dt className="flex items-center gap-2 text-xs text-ink-3"><Swatch color={k.color} />{k.label}</dt>
              <dd className="tabular mt-1 text-base font-semibold">{brl(k.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* espaço próprio das receitas previstas */}
      {(view === "saldo" || view === "fluxo" || view === "receber") && (
        <div className="mt-4 rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--chart-expected)_55%,transparent)] bg-[color-mix(in_oklab,var(--chart-expected)_8%,transparent)] px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="flex items-center gap-2 text-sm font-medium"><Swatch color={C.expected} hatched />Receitas previstas no período</p>
            <p className="text-sm text-ink-2">
              {hasExpected ? (
                <>
                  <span className="tabular font-semibold text-ink">{brl(expectedTotal / 100)}</span> em {chart.expectedIncome.length} recebimento{chart.expectedIncome.length === 1 ? "" : "s"}
                  {!showExpected && " · escondidas do gráfico"}
                </>
              ) : (
                "nenhuma por enquanto"
              )}
            </p>
          </div>
          {hasExpected && (
            <ul className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
              {chart.expectedIncome.slice(0, 10).map((e, i) => (
                <li key={i} className="shrink-0 rounded-xl border border-border bg-surface/70 px-3 py-1.5 text-xs">
                  <span className="block max-w-40 truncate text-ink-2">{e.label}</span>
                  <span className="tabular font-semibold" style={{ color: C.expected }}>+{brl(e.amount / 100)}</span>
                  <span className="ml-2 text-ink-3">{e.late ? "atrasada" : short(e.date)}</span>
                </li>
              ))}
              {chart.expectedIncome.length > 10 && <li className="shrink-0 self-center px-2 text-xs text-ink-3">+{chart.expectedIncome.length - 10}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CatTip({ p }: { p: TooltipContentProps }) {
  if (!p.active || !p.payload?.length) return null;
  const r = p.payload[0].payload as { name: string; value: number; color: string; pct: number };
  return (
    <div className="whitespace-nowrap rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-sm shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
      <p className="mb-1 font-medium">{r.name}</p>
      <TipRow color={r.color} label={`${r.pct}% das despesas`} value={brl(r.value)} />
    </div>
  );
}

function CatLegend({ rows, active, onActive }: { rows: { name: string; value: number; color: string; pct: number }[]; active: string | null; onActive: (n: string | null) => void }) {
  return (
    <ul className="grid gap-1">
      {rows.map((c) => (
        <li key={c.name} onMouseEnter={() => onActive(c.name)} onMouseLeave={() => onActive(null)} className={cn("flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-sm transition-opacity", active && active !== c.name && "opacity-40", active === c.name && "bg-surface-2")}>
          <span className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="size-3 shrink-0 rounded-[4px]" style={{ background: c.color }} />
            <span className="truncate text-ink-2">{c.name}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="tabular font-medium">{brl(c.value)}</span>
            <span className="tabular w-9 text-right text-xs text-ink-3">{c.pct}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  view,
  saldo,
  buckets,
  cats,
  receber,
  showExpected,
}: {
  view: View;
  receber: { date: string; incomeConfirmed: number; incomeExpected: number; cumTotal: number }[];
  saldo: { date: string; main: number; incomeConfirmed: number; incomeExpected: number; expenses: number; balanceConfirmed: number }[];
  buckets: ReturnType<typeof bucketize>;
  cats: { name: string; value: number; pct: number }[];
  showExpected: boolean;
}) {
  const th = "px-3 py-2 text-left text-xs font-medium text-ink-3";
  const td = "tabular px-3 py-2 text-sm";
  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-border">
      <table className="w-full min-w-[28rem] border-collapse">
        <thead className="sticky top-0 bg-surface">
          {view === "saldo" ? (
            <tr><th className={th}>Dia</th><th className={th}>Saldo</th>{showExpected && <th className={th}>Só o confirmado</th>}<th className={th}>Entradas</th><th className={th}>Saídas</th></tr>
          ) : view === "fluxo" ? (
            <tr><th className={th}>{buckets.weekly ? "Semana" : "Dia"}</th><th className={th}>Receitas confirmadas</th><th className={th}>Receitas previstas</th><th className={th}>Saídas</th></tr>
          ) : view === "receber" ? (
            <tr><th className={th}>Dia</th><th className={th}>Confirmado</th><th className={th}>Previsto</th><th className={th}>Total a receber</th></tr>
          ) : view === "pagar" ? (
            <tr><th className={th}>{buckets.weekly ? "Semana" : "Dia"}</th><th className={th}>Faturas</th><th className={th}>Contas fixas e assinaturas</th><th className={th}>Outras</th><th className={th}>Total</th></tr>
          ) : (
            <tr><th className={th}>Categoria</th><th className={th}>Valor</th><th className={th}>%</th></tr>
          )}
        </thead>
        <tbody>
          {view === "saldo" &&
            saldo.map((d) => (
              <tr key={d.date} className="border-t border-border">
                <td className={td}>{formatDateBR(d.date)}</td>
                <td className={td}>{brl(d.main)}</td>
                {showExpected && <td className={td}>{brl(d.balanceConfirmed)}</td>}
                <td className={td}>{brl(d.incomeConfirmed + (showExpected ? d.incomeExpected : 0))}</td>
                <td className={td}>{brl(d.expenses)}</td>
              </tr>
            ))}
          {view === "fluxo" &&
            buckets.rows.map((d) => (
              <tr key={d.key} className="border-t border-border">
                <td className={td}>{d.title}</td>
                <td className={td}>{brl(d.incomeConfirmed)}</td>
                <td className={td}>{brl(d.incomeExpected)}</td>
                <td className={td}>{brl(d.expenses)}</td>
              </tr>
            ))}
          {view === "receber" &&
            receber.map((d) => (
              <tr key={d.date} className="border-t border-border">
                <td className={td}>{formatDateBR(d.date)}</td>
                <td className={td}>{brl(d.incomeConfirmed)}</td>
                <td className={td}>{brl(d.incomeExpected)}</td>
                <td className={td}>{brl(d.cumTotal)}</td>
              </tr>
            ))}
          {view === "pagar" &&
            buckets.rows.map((d) => (
              <tr key={d.key} className="border-t border-border">
                <td className={td}>{d.title}</td>
                <td className={td}>{brl(d.outInvoices)}</td>
                <td className={td}>{brl(d.outRecurring)}</td>
                <td className={td}>{brl(d.outOther)}</td>
                <td className={td}>{brl(d.expenses)}</td>
              </tr>
            ))}
          {view === "categorias" &&
            cats.map((c) => (
              <tr key={c.name} className="border-t border-border">
                <td className={td}>{c.name}</td>
                <td className={td}>{brl(c.value)}</td>
                <td className={td}>{c.pct}%</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
