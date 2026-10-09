"use client";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDateBR } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";

/** Saldo projetado por dia. Valores em reais apenas para desenhar; rótulos voltam a centavos. */
export function BalanceChart({ series, reserve }: { series: { date: string; balance: number }[]; reserve: number }) {
  const toCents = (v: number) => Math.round(v * 100) as Cents;
  const min = Math.min(0, ...series.map((s) => s.balance));
  return (
    <div className="h-48 w-full sm:h-56" role="img" aria-label={`Saldo projetado de ${formatDateBR(series[0].date)} a ${formatDateBR(series.at(-1)!.date)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="nexo-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`}
            tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            width={56}
            domain={[min < 0 ? "dataMin" : 0, "auto"]}
            tickFormatter={(v: number) => `${Math.round(v).toLocaleString("pt-BR")}`}
            tick={{ fill: "var(--ink-3)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          {min < 0 && <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="4 4" />}
          {reserve > 0 && <ReferenceLine y={reserve / 100} stroke="var(--warning)" strokeDasharray="2 4" />}
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--ink)" }}
            labelFormatter={(d) => formatDateBR(String(d))}
            formatter={(v) => [formatBRL(toCents(Number(v))), "Saldo previsto"]}
          />
          <Area type="stepAfter" dataKey="balance" stroke="var(--accent)" strokeWidth={2.25} fill="url(#nexo-area)" isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
