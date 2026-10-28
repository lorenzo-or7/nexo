import type { Metadata } from "next";
import { EntriesView } from "@/components/entries/entries-view";
import { loadProfile } from "@/lib/data/finance";
import { loadConsumption } from "@/lib/data/consumption";
import { loadEntries, loadQuickEntryData, parseFilters } from "@/lib/data/ledger";
import { syncFixedIncome } from "@/lib/data/fixed-income";
import { syncSubscriptions } from "@/lib/data/subscriptions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function EntriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  await Promise.all([syncSubscriptions(supabase, profile), syncFixedIncome(supabase, profile)]);
  const data = await loadQuickEntryData(supabase, profile);
  const filters = parseFilters(sp);
  const [entries, consumption] = await Promise.all([loadEntries(supabase, filters, data.categories), loadConsumption(supabase, profile, filters)]);
  const query = { mes: sp.mes, conta: sp.conta, tipo: sp.tipo, categoria: sp.categoria, q: sp.q };
  return <EntriesView entries={entries} consumption={consumption} filters={filters} data={data} query={query} />;
}
