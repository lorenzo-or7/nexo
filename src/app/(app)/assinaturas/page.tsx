import type { Metadata } from "next";
import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import { Panel } from "@/components/ui/card";
import { todayIn } from "@/domain/dates";
import { loadProfile } from "@/lib/data/finance";
import { loadQuickEntryData } from "@/lib/data/ledger";
import { buildSubscriptionItems, loadSubscriptionRows, syncSubscriptions } from "@/lib/data/subscriptions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assinaturas" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  await syncSubscriptions(supabase, profile);
  const [rows, data] = await Promise.all([loadSubscriptionRows(supabase), loadQuickEntryData(supabase, profile)]);
  if (rows === null) {
    return (
      <Panel className="max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight">Falta um passo no Supabase</h1>
        <p className="mt-2 text-ink-2">
          Rode o arquivo <code>supabase/migrations/20261010001100_subscriptions.sql</code> no SQL Editor e recarregue esta página.
        </p>
      </Panel>
    );
  }
  // as contas fixas têm tela própria (/contas-fixas), mas somam na previsão do saldo do mesmo jeito
  const model = buildSubscriptionItems(rows.filter((r) => r.kind !== "bill"), data, todayIn(profile.timezone));
  return <SubscriptionsView {...model} data={data} openNew={sp.nova === "1"} />;
}
