"use client";
import { BellRing, CalendarClock, CreditCard, Landmark, Pencil, Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { formatDateBR } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";
import type { QuickEntryData } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";
import { CancelSubscriptionButton, RemoveSubscriptionButton, StatusButton, SubscriptionEditor, type SubscriptionItem } from "./subscription-dialogs";

type Tab = "active" | "paused" | "cancelled";
const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "Ativas" },
  { key: "paused", label: "Pausadas" },
  { key: "cancelled", label: "Canceladas" },
];

function when(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

export function SubscriptionsView({
  items,
  data,
  totals,
  next30,
  openNew,
}: {
  items: SubscriptionItem[];
  data: QuickEntryData;
  totals: { monthly: Cents; yearly: Cents; activeCount: number };
  next30: { total: Cents; count: number };
  openNew?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("active");
  const [editing, setEditing] = useState<SubscriptionItem | "new" | null>(openNew ? "new" : null);
  const shown = items
    .filter((i) => i.status === tab)
    .sort((a, b) => (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999") || a.name.localeCompare(b.name));
  const count = (t: Tab) => items.filter((i) => i.status === t).length;
  const soon = items.filter((i) => i.status === "active" && i.daysToNext !== null && i.daysToNext <= i.alertDays);
  const newButton = (
    <Button onClick={() => setEditing("new")}>
      <Plus />
      Nova assinatura
    </Button>
  );

  return (
    <>
      <PageHeader title="Assinaturas" subtitle="Tudo o que renova sozinho, num lugar só." actions={newButton} />

      {items.length === 0 ? (
        <Panel className="grid max-w-xl justify-items-start gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Repeat className="size-6" /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Nenhuma assinatura ainda</h2>
            <p className="mt-1 text-ink-2">Streaming, música, apps, academia: cadastre uma vez e o NEXO lança cada cobrança e prevê as próximas no seu saldo.</p>
          </div>
          {newButton}
        </Panel>
      ) : (
        <>
          <Panel className="mb-6 grid grid-cols-2 gap-5 sm:grid-cols-3 sm:gap-6" data-testid="subs-summary">
            <div className="col-span-2 sm:col-span-1">
              <p className="text-sm text-ink-2">Custo por mês</p>
              <p className="text-hero mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.04em]"><Money value={totals.monthly} /></p>
              <p className="mt-1.5 text-sm text-ink-3">{totals.activeCount} ativa{totals.activeCount === 1 ? "" : "s"} · anuais e trimestrais divididas por mês</p>
            </div>
            <div>
              <p className="text-sm text-ink-2">Por ano</p>
              <p className="mt-1 text-xl font-semibold"><Money value={totals.yearly} /></p>
            </div>
            <div>
              <p className="text-sm text-ink-2">Próximos 30 dias</p>
              <p className="mt-1 text-xl font-semibold"><Money value={next30.total} /></p>
              <p className="mt-1.5 text-sm text-ink-3">{next30.count} cobrança{next30.count === 1 ? "" : "s"}</p>
            </div>
          </Panel>

          {soon.length > 0 && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-warning-soft px-4 py-3 text-sm">
              <BellRing className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>
                <span className="font-medium">Renova em breve: </span>
                {soon.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ", "}
                    {s.name} {when(s.daysToNext)} ({formatBRL(s.price)})
                  </span>
                ))}
              </p>
            </div>
          )}

          <div role="tablist" aria-label="Situação" className="panel-quiet mb-6 inline-flex gap-1 rounded-full p-1">
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
            <p className="text-ink-3">Nada aqui.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {shown.map((s) => (
                <li key={s.id} className="min-w-0">
                  <Panel className={cn("relative flex h-full flex-col gap-4 overflow-hidden p-5", s.status !== "active" && "opacity-80")} data-testid="subscription">
                    <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-25 blur-2xl" style={{ background: s.color }} />
                    <div className="relative flex items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-semibold text-white" style={{ background: `linear-gradient(135deg, ${s.color}, color-mix(in oklab, ${s.color} 55%, black))` }}>
                        {s.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate font-semibold">{s.name}</h2>
                        <p className="truncate text-sm text-ink-3">{[s.frequencyLabel, s.categoryName].filter(Boolean).join(" · ")}</p>
                      </div>
                      <p className="shrink-0 text-right">
                        <span className="tabular text-lg font-semibold">{formatBRL(s.price)}</span>
                        <span className="text-sm text-ink-3">{s.per}</span>
                      </p>
                    </div>

                    <dl className="relative grid grid-cols-2 gap-3 text-sm">
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-ink-3"><CalendarClock className="size-3.5" />{s.status === "active" ? "Próxima cobrança" : s.status === "paused" ? "Pausada desde" : "Cancelada em"}</dt>
                        <dd className="mt-0.5 font-medium">
                          {s.status === "active" && s.nextDate ? (
                            <>
                              {formatDateBR(s.nextDate)}{" "}
                              <span className={cn("font-normal", s.daysToNext !== null && s.daysToNext <= s.alertDays ? "text-warning" : "text-ink-3")}>{when(s.daysToNext)}</span>
                            </>
                          ) : s.status === "paused" && s.pausedFrom ? (
                            formatDateBR(s.pausedFrom)
                          ) : s.status === "cancelled" && s.cancelledAt ? (
                            formatDateBR(s.cancelledAt)
                          ) : (
                            "—"
                          )}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="flex items-center gap-1.5 text-ink-3">{s.pay.startsWith("card") ? <CreditCard className="size-3.5" /> : <Landmark className="size-3.5" />}Pago com</dt>
                        <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                          <span className="size-2 shrink-0 rounded-full" style={{ background: s.payColor }} />
                          <span className="truncate">{s.payLabel}</span>
                        </dd>
                      </div>
                    </dl>

                    <div className="relative mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                      <p className="min-w-0 truncate text-xs text-ink-3">
                        {s.chargesCount === 0 ? "Nenhuma cobrança lançada ainda" : `${s.chargesCount} cobrança${s.chargesCount > 1 ? "s" : ""} · ${formatBRL(s.totalPaid)} no total`}
                      </p>
                      <div className="flex shrink-0 items-center">
                        {s.status !== "cancelled" && (
                          <button type="button" aria-label={`Editar ${s.name}`} title="Editar" onClick={() => setEditing(s)} className="grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {s.status === "active" && <StatusButton item={s} action="pause" />}
                        {s.status === "paused" && <StatusButton item={s} action="resume" />}
                        {s.status === "cancelled" && <StatusButton item={s} action="reactivate" />}
                        {s.status !== "cancelled" && <CancelSubscriptionButton item={s} />}
                        <RemoveSubscriptionButton item={s} />
                      </div>
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <SubscriptionEditor
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.id}
        item={editing && editing !== "new" ? editing : undefined}
        data={data}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </>
  );
}
