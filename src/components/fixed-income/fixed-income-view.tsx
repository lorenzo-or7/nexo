"use client";
import { CalendarClock, HandCoins, Landmark, Pencil, Plus, UserRound, Briefcase } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel, PanelHeader } from "@/components/ui/card";
import { formatDateBR } from "@/domain/dates";
import { KIND_LABEL, type FixedIncomeKind, type FixedIncomeTotals } from "@/domain/fixed-income";
import { formatBRL, type Cents } from "@/domain/money";
import type { QuickEntryData } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";
import { EndFixedIncomeButton, FixedIncomeEditor, FixedStatusButton, RemoveFixedIncomeButton, type FixedIncomeItem } from "./fixed-income-dialogs";

type Tab = "all" | FixedIncomeKind | "ended";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "salary", label: "Salário" },
  { key: "client", label: "Clientes" },
  { key: "ended", label: "Encerradas" },
];
/** As abas de uso normal só mostram rendas ativas ou pausadas; as encerradas ficam no histórico. */
const inTab = (i: FixedIncomeItem, t: Tab) => (t === "ended" ? i.status === "ended" : i.status !== "ended" && (t === "all" || i.kind === t));

function when(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  if (days < 0) return `há ${-days} dias`;
  return `em ${days} dias`;
}

export function FixedIncomeView({
  items,
  data,
  totals,
  upcoming,
  openNew,
}: {
  items: FixedIncomeItem[];
  data: QuickEntryData;
  totals: FixedIncomeTotals;
  upcoming: { id: string; name: string; kind: FixedIncomeKind; date: string; amount: Cents }[];
  openNew?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [editing, setEditing] = useState<{ item?: FixedIncomeItem; kind?: FixedIncomeKind } | null>(openNew ? {} : null);
  const shown = items
    .filter((i) => inTab(i, tab))
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999") || a.name.localeCompare(b.name));
  const count = (t: Tab) => items.filter((i) => inTab(i, t)).length;
  const hasSalary = items.some((i) => i.kind === "salary");

  const newButton = (
    <Button onClick={() => setEditing({})}>
      <Plus />
      Nova renda
    </Button>
  );

  return (
    <>
      <PageHeader title="Renda fixa" subtitle="Salário e mensalidades dos seus clientes, todo mês na previsão." actions={newButton} />

      {items.length === 0 ? (
        <Panel className="grid max-w-xl justify-items-start gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><HandCoins className="size-6" /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Nenhuma renda fixa ainda</h2>
            <p className="mt-1 text-ink-2">Cadastre seu salário e as mensalidades de cada cliente uma vez. Todo mês o NEXO cria o recebimento previsto no dia certo e soma na previsão do saldo.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setEditing({ kind: "salary" })}><Plus />Cadastrar salário</Button>
            <Button variant="outline" onClick={() => setEditing({ kind: "client" })}><Plus />Cadastrar cliente</Button>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="mb-6 grid grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-6" data-testid="fixed-summary">
            <div className="col-span-2">
              <p className="text-sm text-ink-2">Renda fixa por mês</p>
              <p className="text-hero mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.04em]"><Money value={totals.monthly} /></p>
              <p className="mt-1.5 text-sm text-ink-3">{totals.activeCount} ativa{totals.activeCount === 1 ? "" : "s"} · <Money value={totals.yearly} /> por ano</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-ink-2"><span className="size-2 rounded-full" style={{ background: "var(--chart-income)" }} />Salário</p>
              <p className="mt-1 text-xl font-semibold"><Money value={totals.salary} /></p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-sm text-ink-2"><span className="size-2 rounded-full" style={{ background: "var(--chart-expected)" }} />Clientes</p>
              <p className="mt-1 text-xl font-semibold"><Money value={totals.clients} /></p>
            </div>
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
              <div role="tablist" aria-label="Tipo de renda" className="panel-quiet mb-6 inline-flex gap-1 rounded-full p-1">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    role="tab"
                    type="button"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={cn("h-9 rounded-full px-4 text-sm font-medium transition-colors", tab === t.key ? "btn-glow" : "text-ink-2 hover:text-ink")}
                  >
                    {t.label}
                    <span className={cn("ml-1.5 tabular text-xs", tab === t.key ? "opacity-80" : "text-ink-3")}>{count(t.key)}</span>
                  </button>
                ))}
              </div>

              {shown.length === 0 ? (
                <p className="text-ink-3">{tab === "ended" ? "Nenhuma renda encerrada." : "Nada aqui."}</p>
              ) : (
                <ul className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                  {shown.map((s) => (
                    <li key={s.id} className="min-w-0">
                      <Panel className={cn("relative flex h-full flex-col gap-4 overflow-hidden p-5", s.status === "paused" && "opacity-75")} data-testid="fixed-income">
                        <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-25 blur-2xl" style={{ background: s.color }} />
                        <div className="relative flex items-start gap-3">
                          <span className="grid size-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${s.color}, color-mix(in oklab, ${s.color} 55%, black))` }}>
                            {s.kind === "salary" ? <Briefcase className="size-5" /> : <UserRound className="size-5" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h2 className="truncate font-semibold">{s.name}</h2>
                            <p className="truncate text-sm text-ink-3">
                              {[s.kind === "client" ? s.clientName ?? KIND_LABEL.client : KIND_LABEL.salary, `todo dia ${s.dayOfMonth}`].join(" · ")}
                            </p>
                          </div>
                          <p className="shrink-0 text-right">
                            <span className="tabular text-lg font-semibold">{formatBRL(s.amount)}</span>
                            <span className="text-sm text-ink-3">/mês</span>
                          </p>
                        </div>

                        <dl className="relative grid grid-cols-2 gap-3 text-sm">
                          <div className="min-w-0">
                            <dt className="flex items-center gap-1.5 text-ink-3"><CalendarClock className="size-3.5" />{s.status === "active" ? "Próximo recebimento" : s.status === "paused" ? "Pausada" : "Encerrada"}</dt>
                            <dd className="mt-0.5 font-medium">
                              {s.status === "active" && s.nextDate ? (
                                <>
                                  {formatDateBR(s.nextDate)} <span className="font-normal text-ink-3">{when(s.daysToNext)}</span>
                                </>
                              ) : s.endDate && s.status === "ended" ? (
                                `até ${formatDateBR(s.endDate)}`
                              ) : (
                                "—"
                              )}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="flex items-center gap-1.5 text-ink-3"><Landmark className="size-3.5" />Cai na conta</dt>
                            <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                              <span className="size-2 shrink-0 rounded-full" style={{ background: s.accountColor }} />
                              <span className="truncate">{s.accountName}</span>
                            </dd>
                          </div>
                        </dl>

                        <div className="relative mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                          <p className="min-w-0 truncate text-xs text-ink-3">
                            {s.receivedCount === 0 ? "Nenhum recebimento confirmado" : `${s.receivedCount} recebido${s.receivedCount > 1 ? "s" : ""} · ${formatBRL(s.receivedTotal)}`}
                            {s.endDate && s.status !== "ended" ? ` · até ${formatDateBR(s.endDate)}` : ""}
                          </p>
                          <div className="flex shrink-0 items-center">
                            {s.status !== "ended" && (
                              <button type="button" aria-label={`Editar ${s.name}`} title="Editar" onClick={() => setEditing({ item: s })} className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                                <Pencil className="size-4" />
                              </button>
                            )}
                            {s.status === "active" && <FixedStatusButton item={s} action="pause" />}
                            {s.status === "paused" && <FixedStatusButton item={s} action="resume" />}
                            {s.status !== "ended" && <EndFixedIncomeButton item={s} />}
                            <RemoveFixedIncomeButton item={s} />
                          </div>
                        </div>
                      </Panel>
                    </li>
                  ))}
                </ul>
              )}
              {!hasSalary && (
                <button type="button" onClick={() => setEditing({ kind: "salary" })} className="mt-6 text-sm font-medium text-accent underline-offset-4 hover:underline">
                  + Cadastrar meu salário
                </button>
              )}
            </div>

            <Panel className="h-fit">
              <PanelHeader title="Próximos recebimentos" description="Os meses que ainda vão chegar" />
              {upcoming.length === 0 ? (
                <p className="text-sm text-ink-3">Nada previsto.</p>
              ) : (
                <ol className="grid">
                  {upcoming.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                        {u.kind === "salary" ? <Briefcase className="size-[18px]" /> : <UserRound className="size-[18px]" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-medium">{u.name}</span>
                        <span className="text-xs text-ink-3">{formatDateBR(u.date)}</span>
                      </span>
                      <Money value={u.amount} tone="flow" signed className="text-[0.9375rem] font-semibold" />
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </>
      )}

      <FixedIncomeEditor
        key={editing === null ? "closed" : editing.item?.id ?? `new-${editing.kind ?? "x"}`}
        item={editing?.item}
        initialKind={editing?.kind}
        data={data}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </>
  );
}
