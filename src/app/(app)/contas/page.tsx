import type { Metadata } from "next";
import { AccountsView } from "@/components/accounts/accounts-view";
import { loadAccounts } from "@/lib/data/accounts";
import { loadProfile } from "@/lib/data/finance";
import { syncSubscriptions } from "@/lib/data/subscriptions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contas" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  await syncSubscriptions(supabase, profile);
  const { today, monthEnd, accounts } = await loadAccounts(supabase, profile);
  return <AccountsView accounts={accounts} today={today} monthEnd={monthEnd} openNew={sp.nova === "1"} />;
}
