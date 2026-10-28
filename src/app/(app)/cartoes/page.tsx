import type { Metadata } from "next";
import { CardsView } from "@/components/cards/cards-view";
import { loadCards } from "@/lib/data/cards";
import { loadProfile } from "@/lib/data/finance";
import { syncFixedIncome } from "@/lib/data/fixed-income";
import { syncSubscriptions } from "@/lib/data/subscriptions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cartões" };

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  await Promise.all([syncSubscriptions(supabase, profile), syncFixedIncome(supabase, profile)]);
  const { cards, accounts, today } = await loadCards(supabase, profile);
  return <CardsView cards={cards} accounts={accounts} today={today} openNew={sp.novo === "1"} />;
}
