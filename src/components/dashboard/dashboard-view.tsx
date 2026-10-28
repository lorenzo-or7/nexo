import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, CreditCard, Plus } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Panel, PanelHeader } from "@/components/ui/card";
import { Money } from "@/components/money";
import type { DashboardModel } from "@/domain/dashboard";
import { formatDateBR } from "@/domain/dates";
import type { TimelineStatus } from "@/domain/timeline";
import { cn } from "@/lib/cn";
import { ForecastPanel } from "./forecast-panel";
import { IndicatorProvider, IndicatorTrigger, type IndicatorKey } from "./indicator-detail";
import { BankCardFace } from "@/components/cards/bank-card-face";

const HORIZONS = [
  { key: "month", label: "Até o fim do mês", short: "Mês" },
  { key: "30", label: "30 dias", short: "30 dias" },
  { key: "60", label: "60 dias", short: "60 dias" },
  { key: "90", label: "90 dias", short: "90 dias" },
] as const;

const STATUS: Record<TimelineStatus, { label: string; className: string }> = {
  realized: { label: "Realizada", className: "bg-surface-2 text-ink-2" },
  confirmed: { label: "Confirmada", className: "bg-surface-2 text-ink-2" },
  expected: { label: "Prevista", className: "border border-dashed border-border-strong text-ink-2" },
  late: { label: "Atrasada", className: "bg-warning-soft text-warning" },
  hypothetical: { label: "Simulação", className: "bg-accent-soft text-accent" },
};

const INVOICE_STATUS: Record<string, string> = {
  open: "Fatura aberta",
  closed: "Fatura fechada",
  overdue: "Fatura vencida",
  paid: "Sem fatura a pagar",
};

const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function DashboardView({
  model,
  horizon,
  basePath = "/",
  name,
  emptyState,
  demoNotice,
}: {
  model: DashboardModel;
  horizon: string;
  basePath?: string;
  name: string;
  emptyState?: React.ReactNode;
  demoNotice?: React.ReactNode;
}) {
  const t = model.totals;
  const greeting = `Olá, ${name}`;

  if (!model.hasData) {
    return (
      <>
        <PageHeader title={greeting} subtitle="Vamos montar seu panorama financeiro." />
        {emptyState}
      </>
    );
  }

  return (
    <IndicatorProvider model={model}>
      <PageHeader
        title={greeting}
        subtitle={`Hoje é ${formatDateBR(model.today)}`}
        actions={
          <nav aria-label="Período da projeção" className="flex max-w-full rounded-full border border-border bg-field/60 p-1">
            {HORIZONS.map((h) => (
              <Link
                key={h.key}
                href={h.key === "month" ? basePath : `${basePath}?h=${h.key}`}
                aria-current={horizon === h.key ? "true" : undefined}
                className={cn(
                  "min-w-0 whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm transition-colors sm:px-3",
                  horizon === h.key ? "btn-primary" : "text-ink-2 hover:text-ink",
                )}
              >
                <span className="sm:hidden">{h.short}</span>
                <span className="hidden sm:inline">{h.label}</span>
              </Link>
            ))}
          </nav>
        }
      />

      {demoNotice}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-6">
        {/* destaque: quanto posso gastar + gráficos (com seletor de receitas previstas) */}
        <ForecastPanel model={model} />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:gap-6">
          <Panel>
            <IndicatorTrigger k="bank" className="block w-full">
              <p className="text-sm text-ink-2">Saldo em conta hoje</p>
              <p className="mt-1 text-[2rem] font-semibold tracking-[-0.035em]"><Money value={t.bankBalance} /></p>
              <p className="mt-1 text-sm text-ink-3">Só o que já entrou e saiu de verdade.</p>
            </IndicatorTrigger>
            {model.accounts.length > 0 && (
              <ul className="mt-4 grid gap-2 border-t border-border pt-4">
                {model.accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                      <span className="truncate text-ink-2">{a.name}</span>
                    </span>
                    <Money value={a.balance} className="font-medium" />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel className="grid grid-cols-2 gap-3 p-4 sm:p-4">
            {([
              { key: "receive", label: "A receber", value: t.toReceive, icon: <ArrowDownLeft className="size-4" />, tone: "text-positive bg-positive-soft" },
              { key: "pay", label: "A pagar", value: t.toPay, icon: <ArrowUpRight className="size-4" />, tone: "text-negative bg-accent-soft" },
              { key: "open", label: "Faturas abertas", value: t.openInvoices, icon: <CreditCard className="size-4" />, tone: "text-ink-2 bg-surface-2" },
              { key: "closed", label: "Fechadas a pagar", value: t.closedUnpaid, icon: <CalendarClock className="size-4" />, tone: "text-ink-2 bg-surface-2" },
            ] as { key: IndicatorKey; label: string; value: number; icon: React.ReactNode; tone: string }[]).map((x) => (
              <IndicatorTrigger key={x.key} k={x.key} className="rounded-2xl border border-border bg-field/50 p-3.5 hover:border-accent">
                <span className={cn("grid size-8 place-items-center rounded-lg", x.tone)}>{x.icon}</span>
                <p className="mt-3 text-sm text-ink-2">{x.label}</p>
                <p className="mt-0.5 text-lg font-semibold tracking-tight"><Money value={x.value} /></p>
              </IndicatorTrigger>
            ))}
          </Panel>
        </div>
      </div>

      {/* cartões */}
      <section aria-labelledby="cartoes" className="mt-8">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 id="cartoes" className="text-[1.0625rem] font-semibold tracking-tight">Cartões</h2>
          <Link href="/cartoes" className="text-sm font-medium text-accent underline-offset-4 hover:underline">Gerenciar cartões</Link>
        </div>
        <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] sm:overflow-visible sm:px-0">
          {model.cards.map((c) => (
            <li key={c.id} className="w-[17.5rem] shrink-0 snap-start sm:w-auto">
              <BankCardFace
                card={{ name: c.name, institutionKey: c.institutionKey ?? null, institutionName: c.institution, brand: c.brand, lastFour: c.lastFour, color: c.color, logoUrl: c.logoUrl, artUrl: c.artUrl }}
              />
              <div className="mt-3 flex items-baseline justify-between gap-3 px-1">
                <span className="text-sm text-ink-3">{INVOICE_STATUS[c.status] ?? "Fatura"}</span>
                <Money value={c.currentInvoice} className="font-semibold" />
              </div>
              <p className="px-1 text-xs text-ink-3">{c.currentDue ? `Vence em ${formatDateBR(c.currentDue)}` : "Nada a pagar agora"}</p>
            </li>
          ))}
          <li className="w-[17.5rem] shrink-0 snap-start sm:w-auto">
            <Link
              href="/cartoes?novo=1"
              className="grid aspect-[1.586] w-full place-items-center rounded-[18px] border-2 border-dashed border-border-strong text-ink-3 transition-colors hover:border-accent hover:text-accent"
            >
              <span className="flex flex-col items-center gap-2 text-sm font-medium">
                <Plus className="size-6" />
                Adicionar cartão
              </span>
            </Link>
          </li>
        </ul>
      </section>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:gap-6">
        <Panel>
          <PanelHeader title="Próximos vencimentos" description={`Até ${formatDateBR(model.horizonEnd)}`} />
          {model.upcoming.length === 0 ? (
            <p className="text-sm text-ink-3">Nada previsto para o período.</p>
          ) : (
            <ol className="grid grid-cols-[minmax(0,1fr)]">
              {model.upcoming.map((u, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                    {u.label.startsWith("Fatura") ? <CreditCard className="size-[18px]" /> : <CalendarClock className="size-[18px]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{u.label}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                      {formatDateBR(u.date)}
                      <span className={cn("rounded-full px-2 py-0.5", STATUS[u.status].className)}>{STATUS[u.status].label}</span>
                      {u.originalDate && <span>desde {short(u.originalDate)}</span>}
                    </span>
                  </span>
                  <Money value={u.amount} tone="flow" signed className="text-[0.9375rem] font-semibold" />
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Este mês" description="Consumo pela data da compra; pagamento de fatura não conta de novo." />
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-ink-2">Receitas recebidas</dt>
              <dd className="mt-1 text-xl font-semibold"><Money value={t.monthIncome} /></dd>
            </div>
            <div>
              <dt className="text-sm text-ink-2">Despesas</dt>
              <dd className="mt-1 text-xl font-semibold"><Money value={t.monthExpenses} /></dd>
            </div>
          </dl>
          {model.byCategory.length > 0 && (
            <ul className="mt-5 grid gap-3">
              {model.byCategory.slice(0, 5).map((c) => {
                const pct = t.monthExpenses > 0 ? Math.round((c.amount / t.monthExpenses) * 100) : 0;
                return (
                  <li key={c.name} className="grid gap-1.5">
                    <span className="flex justify-between text-sm"><span>{c.name}</span><Money value={c.amount} className="text-ink-2" /></span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: c.color }} /></span>
                  </li>
                );
              })}
            </ul>
          )}
          <h3 className="mb-2 mt-6 text-sm font-semibold text-ink-2">Últimas movimentações</h3>
          {model.recent.length === 0 ? (
            <p className="text-sm text-ink-3">Nenhuma movimentação realizada ainda.</p>
          ) : (
            <ul>
              {model.recent.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 border-t border-border py-2.5 text-sm first:border-t-0">
                  <span className="min-w-0 truncate">{r.label}<span className="ml-2 text-ink-3">{short(r.date)}</span></span>
                  <Money value={r.amount} tone="flow" signed />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </IndicatorProvider>
  );
}
