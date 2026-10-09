import { notFound } from "next/navigation";
import { EntriesView } from "@/components/entries/entries-view";
import { AppShell } from "@/components/shell/app-shell";
import { isPreviewEnabled } from "@/lib/env";
import { parseFilters } from "@/lib/data/ledger";
import { entries, quickEntry } from "../mock";

export default async function Preview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const list = entries.filter((e) => (!filters.accountId || e.accountId === filters.accountId || e.transfer?.toId === filters.accountId) && (!filters.accountId || !e.purchase) && (filters.kind !== "pending" || e.status !== "confirmed") && (!filters.month || e.date.startsWith(filters.month))).sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <EntriesView entries={sp.vazio ? [] : list} filters={filters} data={quickEntry} basePath="/dev/preview/lancamentos" query={{ mes: sp.mes, conta: sp.conta, tipo: sp.tipo }} />
    </AppShell>
  );
}
