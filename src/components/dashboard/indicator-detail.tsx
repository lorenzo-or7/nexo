"use client";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import * as React from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { DashboardModel } from "@/domain/dashboard";
import { formatDateBR, formatMonthBR } from "@/domain/dates";
import type { Composition, DetailItem, InvoiceDetail } from "@/domain/indicators";
import { formatBRL, type Cents } from "@/domain/money";
import type { TimelineStatus } from "@/domain/timeline";
import { cn } from "@/lib/cn";

export type IndicatorKey = "bank" | "receive" | "pay" | "open" | "closed" | "free" | "lowest" | "end";
type Mode = "confirmed" | "all";

const TITLES: Record<IndicatorKey, string> = {
  bank: "Saldo em conta hoje",
  receive: "A receber",
  pay: "A pagar",
  open: "Faturas abertas",
  closed: "Fechadas a pagar",
  free: "Livre para gastar",
  lowest: "Menor saldo previsto",
  end: "Saldo ao final do período",
};

const STATUS_LABEL: Record<TimelineStatus, string> = {
  realized: "Realizada",
  confirmed: "Confirmada",
  expected: "Prevista",
  late: "Atrasada",
  hypothetical: "Simulação",
};

interface Ctx {
  open: (k: IndicatorKey, mode?: Mode) => void;
}
const IndicatorCtx = React.createContext<Ctx | null>(null);

export function IndicatorProvider({ model, children }: { model: DashboardModel; children: React.ReactNode }) {
  const [state, setState] = React.useState<{ key: IndicatorKey; mode: Mode } | null>(null);
  const [lastKey, setLastKey] = React.useState<IndicatorKey>("bank");
  const open = React.useCallback((key: IndicatorKey, mode: Mode = "all") => {
    setLastKey(key);
    setState({ key, mode });
  }, []);
  const key = state?.key ?? lastKey;
  return (
    <IndicatorCtx.Provider value={{ open }}>
      {children}
      <Dialog open={state !== null} onOpenChange={(o) => !o && setState(null)}>
        <DialogContent side title={TITLES[key]} description={`Até ${formatDateBR(model.horizonEnd)}`} className="[--dialog-w:480px]">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 p-5 sm:p-6" data-testid="indicator-panel">
            <Body model={model} k={key} mode={state?.mode ?? "all"} onMode={(m) => setState((s) => (s ? { ...s, mode: m } : s))} />
            <Button variant="ghost" className="justify-self-start" onClick={() => setState(null)}>
              <ArrowLeft />
              Voltar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </IndicatorCtx.Provider>
  );
}

/** Botão que abre o detalhamento de um indicador. */
export function IndicatorTrigger({
  k, mode, className, children, label,
}: {
  k: IndicatorKey; mode?: Mode; className?: string; children: React.ReactNode; label?: string;
}) {
  const ctx = React.useContext(IndicatorCtx);
  return (
    <button
      type="button"
      onClick={() => ctx?.open(k, mode)}
      aria-label={label ?? `Ver detalhes: ${TITLES[k]}`}
      aria-haspopup="dialog"
      data-indicator={k}
      className={cn("text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", className)}
    >
      {children}
    </button>
  );
}

function Total({ label, value, note }: { label: string; value: Cents; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight" data-testid="indicator-total"><Money value={value} /></p>
      {note && <p className="mt-1 text-sm text-ink-3">{note}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border-strong p-4 text-sm text-ink-3">{children}</p>;
}

function ItemList({ items, total }: { items: DetailItem[]; total: number }) {
  if (items.length === 0) return <Empty>Nada no período.</Empty>;
  const late = items.filter((i) => i.status === "late").length;
  return (
    <>
      <p className="text-sm text-ink-3">
        {items.length} {items.length === 1 ? "item" : "itens"}
        {late > 0 && <> · <span className="font-medium text-warning">{late} atrasado{late > 1 ? "s" : ""}</span></>}
        {" · "}soma <Money value={total} />
      </p>
      <ul className="grid">
        {items.map((i) => (
          <li key={i.id} className="border-t border-border first:border-t-0">
            <Link href={i.href} className="flex items-center gap-3 py-3 hover:bg-surface-2/60" aria-label={`Abrir ${i.label}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-medium">{i.label}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                  {formatDateBR(i.date)}
                  <span className={cn("rounded-full px-2 py-0.5", i.status === "late" ? "bg-warning-soft text-warning" : i.status === "expected" ? "border border-dashed border-border-strong" : "bg-surface-2")}>
                    {STATUS_LABEL[i.status]}
                  </span>
                  {i.originalDate && <span>desde {formatDateBR(i.originalDate)}</span>}
                </span>
              </span>
              <Money value={Math.abs(i.amount)} className="text-[0.9375rem] font-semibold" />
              <ExternalLink className="size-4 shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function InvoiceRows({ items, empty }: { items: InvoiceDetail[]; empty: string }) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="grid gap-3">
      {items.map((i) => (
        <li key={`${i.cardId}-${i.ref}`} className="grid gap-2 rounded-2xl border border-border p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">{i.cardName} · <span className="capitalize">{formatMonthBR(i.ref)}</span></span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", i.label === "Vencida" ? "bg-accent-soft text-negative" : "bg-surface-2 text-ink-2")}>{i.label}</span>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-ink-3">Fatura</dt><dd><Money value={i.total} /></dd></div>
            <div><dt className="text-ink-3">Pago</dt><dd><Money value={i.paid} /></dd></div>
            <div><dt className="text-ink-3">Falta</dt><dd className="font-semibold"><Money value={i.remaining} /></dd></div>
          </dl>
          <p className="text-xs text-ink-3">Fecha {formatDateBR(i.closingDate)} · vence {formatDateBR(i.dueDate)}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="ghost"><Link href="/cartoes">Abrir fatura</Link></Button>
            <Button asChild size="sm" variant="accent"><Link href="/cartoes">Registrar pagamento</Link></Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Sparkline({ series, lowestDate }: { series: Composition["series"]; lowestDate: string }) {
  if (series.length < 2) return null;
  const vals = series.map((s) => s.balance);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * 300;
  const y = (v: number) => 70 - ((v - min) / span) * 60;
  const idx = series.findIndex((s) => s.date === lowestDate);
  return (
    <svg viewBox="0 0 300 80" className="h-24 w-full" role="img" aria-label="Evolução do saldo no período">
      <line x1="0" x2="300" y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="3 3" />
      <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points={series.map((s, i) => `${x(i)},${y(s.balance)}`).join(" ")} />
      {idx >= 0 && <circle cx={x(idx)} cy={y(series[idx].balance)} r="4" fill="var(--accent)" />}
    </svg>
  );
}

function Scenario({ mode, onMode, hasExpected }: { mode: Mode; onMode: (m: Mode) => void; hasExpected: boolean }) {
  if (!hasExpected) return <p className="text-sm text-ink-3">Sem receitas previstas no período: o resultado é o mesmo nos dois cenários.</p>;
  return (
    <div role="group" aria-label="Cenário" className="flex rounded-full border border-border bg-field/60 p-1 text-sm">
      {([["confirmed", "Só o confirmado"], ["all", "Com previstas"]] as const).map(([m, l]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}
          className={cn("flex-1 rounded-full px-3 py-1.5", mode === m ? "btn-primary" : "text-ink-2")}>{l}</button>
      ))}
    </div>
  );
}

function CompositionTable({ c, showFree }: { c: Composition; showFree: boolean }) {
  return (
    <dl className="grid text-sm" data-testid="composition">
      <Row label="Saldo em conta hoje" value={c.startBalance} />
      {c.rows.map((r) => (
        <Row key={r.key} label={`${r.amount >= 0 ? "+" : "−"} ${r.label}`} sub={`${r.count} ${r.count === 1 ? "item" : "itens"}`} value={Math.abs(r.amount) as Cents} tone={r.amount >= 0 ? "pos" : "neg"} />
      ))}
      <Row label="Saldo ao final do período" value={c.endBalance} strong />
      {showFree && (
        <>
          <Row label={`Menor saldo previsto · ${formatDateBR(c.lowestDate)}`} value={c.lowest} />
          {c.reserve > 0 && <Row label="− Reserva mínima" value={c.reserve} tone="neg" />}
          {c.safetyMargin > 0 && <Row label="− Margem de segurança" value={c.safetyMargin} tone="neg" />}
          <Row label="Livre para gastar" value={c.free} strong />
        </>
      )}
    </dl>
  );
}

function Row({ label, sub, value, strong, tone }: { label: string; sub?: string; value: number; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-t border-border py-2.5 first:border-t-0", strong && "font-semibold")}>
      <dt className="min-w-0"><span>{label}</span>{sub && <span className="ml-2 text-xs text-ink-3">{sub}</span>}</dt>
      <dd className={cn("tabular whitespace-nowrap", tone === "pos" && "text-positive", tone === "neg" && "text-negative")}>{formatBRL(value as Cents)}</dd>
    </div>
  );
}

function Body({ model, k, mode, onMode }: { model: DashboardModel; k: IndicatorKey; mode: Mode; onMode: (m: Mode) => void }) {
  const t = model.totals;
  const d = model.details;
  const hasExpected = model.chart.expectedIncome.length > 0;
  const effMode: Mode = hasExpected ? mode : "confirmed";
  const comp = effMode === "all" ? d.composition.withExpected : d.composition.confirmed;
  switch (k) {
    case "bank":
      return (
        <>
          <Total label="Saldo consolidado" value={t.bankBalance} note="Só o que já entrou e saiu de verdade." />
          <ul className="grid">
            {model.accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0">
                <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} /><span className="truncate">{a.name}</span></span>
                <span className="flex items-center gap-3"><Money value={a.balance} className="font-semibold" />
                  <Link href={`/lancamentos?conta=${a.id}`} className="text-sm text-accent underline-offset-2 hover:underline" aria-label={`Ver movimentações de ${a.name}`}>Movimentos</Link></span>
              </li>
            ))}
          </ul>
        </>
      );
    case "receive":
      return (
        <>
          <Total label="Total a receber" value={t.toReceive} note="Receitas confirmadas e previstas que ainda não entraram. Não aumentam o saldo em conta até serem confirmadas." />
          <ItemList items={d.receivables} total={t.toReceive} />
        </>
      );
    case "pay":
      return (
        <>
          <Total label="Total a pagar" value={t.toPay} note="Despesas agendadas, contas fixas e o que falta de cada fatura que vence no período." />
          <ItemList items={d.payables} total={-t.toPay} />
        </>
      );
    case "open":
      return (
        <>
          <Total label="Faturas abertas" value={t.openInvoices} note="A fatura ainda aberta de cada cartão. Parcelas de meses futuros ficam separadas abaixo." />
          <InvoiceRows items={d.openInvoices} empty="Nenhuma fatura aberta com valor." />
          {d.futureInvoices.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-ink-2">Faturas futuras (não entram no total acima): <Money value={t.futureInvoices} /></h3>
              <InvoiceRows items={d.futureInvoices} empty="" />
            </>
          )}
        </>
      );
    case "closed":
      return (
        <>
          <Total label="Fechadas a pagar" value={t.closedUnpaid} note="Faturas já fechadas com saldo a pagar (inclui vencidas). Pagas por inteiro não aparecem; pagamento parcial desconta." />
          <InvoiceRows items={d.closedInvoices} empty="Nenhuma fatura fechada pendente." />
        </>
      );
    case "free":
      return (
        <>
          <Scenario mode={effMode} onMode={onMode} hasExpected={hasExpected} />
          <Total label="Livre para gastar" value={comp.free} note="Menor saldo previsto no período, menos reserva e margem." />
          <CompositionTable c={comp} showFree />
        </>
      );
    case "lowest":
      return (
        <>
          <Scenario mode={effMode} onMode={onMode} hasExpected={hasExpected} />
          <Total label={`Menor saldo previsto · ${formatDateBR(comp.lowestDate)}`} value={comp.lowest} />
          <Sparkline series={comp.series} lowestDate={comp.lowestDate} />
          <CompositionTable c={comp} showFree={false} />
        </>
      );
    case "end":
      return (
        <>
          <Scenario mode={effMode} onMode={onMode} hasExpected={hasExpected} />
          <Total label="Saldo ao final do período" value={comp.endBalance} />
          <CompositionTable c={comp} showFree={false} />
        </>
      );
  }
}
