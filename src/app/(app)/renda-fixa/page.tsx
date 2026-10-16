import type { Metadata } from "next";
import { FixedIncomeView } from "@/components/fixed-income/fixed-income-view";
import { Panel } from "@/components/ui/card";
import { todayIn } from "@/domain/dates";
import { buildFixedIncomeItems, loadFixedIncomeRows, syncFixedIncome } from "@/lib/data/fixed-income";
import { loadProfile } from "@/lib/data/finance";
import { loadQuickEntryData } from "@/lib/data/ledger";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Renda fixa" };

export default async function FixedIncomePage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  await syncFixedIncome(supabase, profile);
  const [rows, data] = await Promise.all([loadFixedIncomeRows(supabase), loadQuickEntryData(supabase, profile)]);
  if (rows === null) {
    return (
      <Panel className="max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight">Falta um passo no Supabase</h1>
        <p className="mt-2 text-ink-2">
          Rode o arquivo <code>supabase/migrations/20261016001200_fixed_income.sql</code> no SQL Editor do Supabase e recarregue esta página.
        </p>
      </Panel>
    );
  }
  const model = buildFixedIncomeItems(rows, data, todayIn(profile.timezone));
  return <FixedIncomeView {...model} data={data} openNew={sp.nova === "1"} />;
}
