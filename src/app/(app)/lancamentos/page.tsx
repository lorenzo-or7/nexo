import type { Metadata } from "next";
import { EntriesView } from "@/components/entries/entries-view";
import { loadProfile } from "@/lib/data/finance";
import { loadEntries, loadQuickEntryData, parseFilters } from "@/lib/data/ledger";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  const data = await loadQuickEntryData(supabase, profile);
  const filters = parseFilters(sp, data.today);
  const entries = await loadEntries(supabase, filters, data.categories);
  const query = { mes: sp.mes, conta: sp.conta, tipo: sp.tipo, categoria: sp.categoria, q: sp.q };
  return <EntriesView entries={entries} filters={filters} data={data} query={query} />;
}
