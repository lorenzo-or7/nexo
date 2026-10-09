import Link from "next/link";
import { ArrowLeftRight, ChevronLeft, ChevronRight, CreditCard, Minus, Plus, Receipt, Scale, Undo2 } from "lucide-react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { addMonthRef, formatMonthBR, type LocalDate } from "@/domain/dates";
import { STATUS_LABEL } from "@/domain/entries";
import { sum, type Cents } from "@/domain/money";
import type { EntryFilters, EntryRow, QuickEntryData } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";
import { ConfirmEntryButton, DeleteEntryButton } from "./entry-actions";
import { EntryDialog } from "./entry-dialog";
import { EntriesFilters } from "./entries-filters";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dayHeading(d: LocalDate, today: LocalDate): string {
  const [y, m, day] = d.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  const base = `${day} de ${MONTHS[m - 1]}`;
  if (d === today) return `Hoje, ${base}`;
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)}, ${base}${y !== Number(today.slice(0, 4)) ? ` de ${y}` : ""}`;
}

function monthLabel(m: string) {
  const [y, mm] = m.split("-").map(Number);
  return `${MONTHS[mm - 1].charAt(0).toUpperCase()}${MONTHS[mm - 1].slice(1)} de ${y}`;
}

function iconFor(e: EntryRow) {
  if (e.purchase) return CreditCard;
  if (e.transfer) return ArrowLeftRight;
  if (e.kind === "invoice_payment") return CreditCard;
  if (e.kind === "adjustment") return Scale;
  if (e.kind === "refund") return Undo2;
  if (e.kind === "income") return Plus;
  return e.kind === "expense" ? Minus : Receipt;
}

export function EntriesView({
  entries,
  filters,
  data,
  basePath = "/lancamentos",
  query,
}: {
  entries: EntryRow[];
  filters: EntryFilters;
  data: QuickEntryData;
  basePath?: string;
  query: Record<string, string | undefined>;
}) {
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const accountColor = new Map(data.accounts.map((a) => [a.id, a.color]));
  const cardName = new Map(data.cards.map((c) => [c.id, c.name]));
  const cardColor = new Map(data.cards.map((c) => [c.id, c.color]));
  const category = new Map(data.categories.map((c) => [c.id, c]));
  const catLabel = (id: string | null) => {
    if (!id) return null;
    const c = category.get(id);
    if (!c) return null;
    const parent = c.parentId ? category.get(c.parentId) : null;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };

  const realized = entries.filter((e) => e.status === "confirmed" && !e.transfer);
  const income = sum(realized.filter((e) => e.kind === "income").map((e) => e.amount));
  const refunds = sum(realized.filter((e) => e.kind === "refund").map((e) => e.amount));
  const expenses = sum(realized.filter((e) => e.kind === "expense").map((e) => -e.amount));
  const pendingCount = entries.filter((e) => e.status !== "confirmed").length;

  const href = (month: string) => {
    const p = new URLSearchParams(Object.entries(query).filter(([, v]) => v) as [string, string][]);
    p.set("mes", month);
    return `${basePath}?${p.toString()}`;
  };

  const groups = new Map<LocalDate, EntryRow[]>();
  for (const e of entries) groups.set(e.date, [...(groups.get(e.date) ?? []), e]);

  return (
    <>
      <PageHeader
        title="Lançamentos"
        subtitle={filters.kind === "pending" ? "Tudo que ainda não aconteceu ou não foi confirmado." : "Tudo que entrou e saiu das suas contas."}
        actions={
          <nav aria-label="Mês" className="flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            <Button asChild variant="ghost" size="icon" className="size-9"><Link href={href(addMonthRef(filters.month, -1))} aria-label="Mês anterior"><ChevronLeft /></Link></Button>
            <span className="min-w-36 text-center text-sm font-medium">{monthLabel(filters.month)}</span>
            <Button asChild variant="ghost" size="icon" className="size-9"><Link href={href(addMonthRef(filters.month, 1))} aria-label="Próximo mês"><ChevronRight /></Link></Button>
          </nav>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 grid-cols-1 content-start gap-5">
          <EntriesFilters accounts={data.accounts} categories={data.categories} />

          {entries.length === 0 ? (
            <Panel className="grid justify-items-start gap-3">
              <h2 className="text-lg font-semibold">Nada por aqui</h2>
              <p className="text-ink-2">
                {Object.values(query).some((v, i) => v && Object.keys(query)[i] !== "mes")
                  ? "Nenhum lançamento com esses filtros."
                  : `Nenhum lançamento em ${formatMonthBR(filters.month)}.`}
              </p>
              {data.accounts.length > 0 ? (
                <EntryDialog data={data} defaultAccountId={filters.accountId} trigger={<Button><Plus />Novo lançamento</Button>} />
              ) : (
                <Button asChild><Link href="/contas?nova=1"><Plus />Cadastrar conta</Link></Button>
              )}
            </Panel>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {[...groups.entries()].map(([date, rows]) => (
                <section key={date} aria-label={dayHeading(date, data.today)}>
                  <h2 className="mb-2 px-1 text-sm font-medium text-ink-3">{dayHeading(date, data.today)}</h2>
                  <ul className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                    {rows.map((e) => {
                      const Icon = iconFor(e);
                      const isTransfer = Boolean(e.transfer);
                      const title = e.description || (isTransfer ? "Transferência" : catLabel(e.categoryId)?.split(" › ").pop()) || (e.kind === "adjustment" ? "Ajuste de saldo" : e.kind === "income" ? "Receita" : "Despesa");
                      const isPurchase = Boolean(e.purchase);
                      const editable = !isPurchase && !["adjustment", "invoice_payment"].includes(e.kind);
                      const meta = isTransfer
                        ? `${accountName.get(e.transfer!.fromId) ?? "?"} → ${accountName.get(e.transfer!.toId) ?? "?"}`
                        : isPurchase
                          ? [cardName.get(e.cardId!) ?? "Cartão", e.purchase!.installments > 1 ? `${e.purchase!.installments}x` : "à vista", catLabel(e.categoryId)].filter(Boolean).join(" · ")
                          : [accountName.get(e.accountId), catLabel(e.categoryId)].filter(Boolean).join(" · ");
                      const dot = isPurchase ? cardColor.get(e.cardId!) : accountColor.get(e.accountId);
                      const display = isTransfer && !filters.accountId ? e.transfer!.amount : e.amount;
                      const content = (
                        <>
                          <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
                            <Icon className="size-[18px]" />
                            {!isTransfer && <span aria-hidden className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface" style={{ backgroundColor: dot }} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-medium">{title}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                              <span className="truncate">{meta}</span>
                              {e.status !== "confirmed" && (
                                <span className={cn("rounded-full px-2 py-0.5", e.date < data.today ? "bg-warning-soft text-warning" : e.status === "expected" ? "border border-dashed border-border-strong text-ink-2" : "bg-surface-2 text-ink-2")}>
                                  {e.date < data.today ? "Atrasado" : STATUS_LABEL[e.status]}
                                </span>
                              )}
                              {isPurchase && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-ink-2">Crédito</span>}
                              {e.purchase?.status === "refunded" && <span className="rounded-full bg-positive-soft px-2 py-0.5 text-positive">Estornada</span>}
                              {e.tags.map((t) => <span key={t} className="rounded-full bg-accent-soft px-2 py-0.5 text-accent">{t}</span>)}
                            </span>
                          </span>
                          <Money value={display as Cents} tone={isTransfer && !filters.accountId ? "neutral" : "flow"} signed={!(isTransfer && !filters.accountId)} className={cn("text-[0.9375rem] font-semibold", e.status !== "confirmed" && "opacity-60")} />
                        </>
                      );
                      return (
                        <li key={e.id} className="flex items-center gap-2 border-t border-border pr-2 first:border-t-0">
                          {editable ? (
                            <EntryDialog
                              data={data}
                              initial={e}
                              trigger={
                                <button className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/60" aria-label={`Editar ${title}`}>
                                  {content}
                                </button>
                              }
                            />
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">{content}</div>
                          )}
                          {e.status !== "confirmed" && <ConfirmEntryButton id={e.id} />}
                          <DeleteEntryButton id={e.id} label={title} isTransfer={isTransfer} isPurchase={isPurchase} />
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="grid content-start gap-4 xl:sticky xl:top-8 xl:self-start">
          <Panel className="grid gap-4">
            <h2 className="text-[1.0625rem] font-semibold tracking-tight">Resumo de {formatMonthBR(filters.month)}</h2>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink-2">Receitas</dt><dd><Money value={income} className="font-semibold text-positive" /></dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Despesas</dt><dd><Money value={expenses} className="font-semibold text-negative" /></dd></div>
              {refunds > 0 && <div className="flex justify-between"><dt className="text-ink-2">Reembolsos</dt><dd><Money value={refunds} className="font-semibold" /></dd></div>}
              <div className="flex justify-between border-t border-border pt-3"><dt className="font-medium">Resultado</dt><dd><Money value={(income + refunds - expenses) as Cents} tone="flow" signed className="font-semibold" /></dd></div>
            </dl>
            <p className="text-xs text-ink-3">Só o que já aconteceu. Compras no crédito contam pela data da compra; transferências entre suas contas e pagamentos de fatura não entram.</p>
          </Panel>
          {pendingCount > 0 && filters.kind !== "pending" && (
            <Link href={`${basePath}?tipo=pending`} className="rounded-[var(--radius-card)] border border-dashed border-border-strong px-5 py-4 text-sm text-ink-2 hover:border-accent hover:text-ink">
              <span className="font-semibold text-ink">{pendingCount} {pendingCount === 1 ? "lançamento pendente" : "lançamentos pendentes"}</span> neste mês. Ver todos os pendentes
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
