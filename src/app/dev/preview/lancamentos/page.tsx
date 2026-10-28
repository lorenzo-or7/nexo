import { notFound } from "next/navigation";
import { EntriesView } from "@/components/entries/entries-view";
import { AppShell } from "@/components/shell/app-shell";
import { isPreviewEnabled } from "@/lib/env";
import { parseFilters } from "@/lib/data/ledger";
import { categoryFilterIds } from "@/domain/categories";
import { consumptionFor } from "@/domain/consumption";
import type { SpendingLine } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import { entries, quickEntry } from "../mock";

export default async function Preview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  // ?estorno=1: parcelas 2 e 3 da compra no cartão canceladas por estorno (só a 1ª conta como consumo)
  const source = sp.estorno ? entries.map((e) => (e.purchase ? { ...e, netAmount: -10000 as Cents } : e)) : entries;
  // mesma regra de categoria do servidor: principal inclui subcategorias, "none" = sem categoria
  const catIds = filters.categoryId && filters.categoryId !== "none" ? categoryFilterIds(filters.categoryId, quickEntry.categories) : null;
  const inCategory = (id: string | null) => (filters.categoryId === "none" ? id === null : catIds ? (filters.onlyParent ? id === filters.categoryId : id !== null && catIds.includes(id)) : true);
  const list = source.filter((e) => (!filters.accountId || e.accountId === filters.accountId || e.transfer?.toId === filters.accountId) && (!filters.accountId || !e.purchase) && (filters.kind !== "pending" || e.status !== "confirmed") && (!filters.month || e.date.startsWith(filters.month)) && inCategory(e.categoryId)).sort((a, b) => (a.date < b.date ? 1 : -1));
  // mesmo cálculo do servidor: linhas de consumo confirmadas (compra no cartão pelo líquido) + a regra de categoria
  const lines: SpendingLine[] = source
    .filter((e) => e.status === "confirmed" && !e.transfer && e.kind === "expense" && (!filters.month || e.date.startsWith(filters.month)))
    .map((e) => ({ categoryId: e.categoryId, amount: -(e.netAmount ?? e.amount) as Cents, source: e.purchase ? ("card" as const) : ("account" as const), part: e.purchase ? ("installment" as const) : ("expense" as const), date: e.date, accountOrCardId: e.cardId ?? e.accountId }));
  const consumption = filters.accountId || filters.q || (filters.kind && filters.kind !== "expense") ? null : consumptionFor(lines, quickEntry.categories, { categoryId: filters.categoryId, onlyParent: filters.onlyParent });
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <EntriesView entries={sp.vazio ? [] : list} consumption={consumption} filters={filters} data={quickEntry} basePath="/dev/preview/lancamentos" query={{ mes: sp.mes, conta: sp.conta, tipo: sp.tipo }} />
    </AppShell>
  );
}
