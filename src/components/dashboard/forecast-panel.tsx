"use client";
import { AlertTriangle } from "lucide-react";
import { Money } from "@/components/money";
import { Panel } from "@/components/ui/card";
import type { DashboardModel } from "@/domain/dashboard";
import { formatDateBR } from "@/domain/dates";
import { formatBRL } from "@/domain/money";
import { cn } from "@/lib/cn";
import { FinanceCharts } from "./finance-charts-lazy";
import { Segmented, useStoredPref } from "./segmented";

type Mode = "confirmed" | "all";

const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * Destaque da tela inicial + gráfico, com um único seletor: contar (ou não) as receitas
 * apenas previstas. A escolha vale para os números do topo e para o gráfico ao mesmo tempo.
 */
export function ForecastPanel({ model }: { model: DashboardModel }) {
  const hasExpected = model.chart.expectedIncome.length > 0;
  const [pref, setPref] = useStoredPref<Mode>("forecast-mode", model.chart.defaultShowExpected ? "all" : "confirmed", ["confirmed", "all"]);
  const mode: Mode = hasExpected ? pref : "confirmed";
  const withExpected = mode === "all";
  const sc = withExpected ? model.scenarios.withExpected : model.scenarios.confirmed;
  const reserve = model.totals.reserve;

  return (
    <Panel className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute -right-24 -top-40 -z-10 size-[30rem] rounded-full bg-[radial-gradient(closest-side,var(--glow-1),transparent)]" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
          Livre para gastar até {formatDateBR(model.horizonEnd)}
        </p>
        <div className="flex items-center gap-2">
          <Segmented<Mode>
            label="O que entra na previsão do saldo"
            value={mode}
            onChange={(v) => hasExpected && setPref(v)}
            options={[
              { key: "confirmed", label: "Só o confirmado" },
              { key: "all", label: "Com previstas" },
            ]}
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p
            data-testid="free-to-spend"
            className={cn("text-[2.875rem] font-semibold leading-none tracking-[-0.05em] sm:text-[3.75rem]", sc.free < 0 ? "text-negative" : "text-hero")}
          >
            <Money value={sc.free} />
          </p>
          <p className="mt-3 max-w-md text-sm text-ink-3">
            É o menor saldo previsto no período{reserve > 0 ? `, já descontada a reserva de ${formatBRL(reserve)}` : ""}. Gastar mais do que isso hoje deixaria algum dia no vermelho.
          </p>
          <p className="mt-2 max-w-md text-sm text-ink-3" data-testid="scenario-note">
            {!hasExpected
              ? "Você não tem receitas previstas no período; o saldo conta só o que já está confirmado."
              : withExpected
                ? `Conta ${formatBRL(sc.expectedIncome)} em receitas previstas que ainda não foram confirmadas.`
                : `Sem as ${formatBRL(model.scenarios.withExpected.expectedIncome)} de receitas previstas. Toque em "Com previstas" para vê-las no saldo.`}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <div className="rounded-xl border border-border bg-field/50 px-3.5 py-2.5">
            <p className="text-xs text-ink-3">Menor saldo · {short(sc.lowestDate)}</p>
            <p className="mt-0.5 font-semibold"><Money value={sc.lowest} /></p>
          </div>
          <div className="rounded-xl border border-border bg-field/50 px-3.5 py-2.5">
            <p className="text-xs text-ink-3">Fim do período</p>
            <p className="mt-0.5 font-semibold"><Money value={sc.projected} /></p>
          </div>
        </div>
      </div>

      {sc.firstNegativeDate && (
        <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-accent-soft px-4 py-3 text-sm text-negative">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            O saldo previsto fica negativo em {formatDateBR(sc.firstNegativeDate)}, mesmo que termine o período em <Money value={sc.projected} />.
            {!withExpected && hasExpected && <> Com as receitas previstas, {model.scenarios.withExpected.firstNegativeDate ? `ele ainda fica negativo em ${formatDateBR(model.scenarios.withExpected.firstNegativeDate)}` : "ele não fica negativo"}.</>}
          </span>
        </p>
      )}

      <div className="chart-glow mt-6">
        <FinanceCharts model={model} showExpected={withExpected} onShowExpectedChange={(v) => hasExpected && setPref(v ? "all" : "confirmed")} />
      </div>
    </Panel>
  );
}
