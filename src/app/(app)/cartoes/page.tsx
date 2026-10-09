import type { Metadata } from "next";
import { CardsView } from "@/components/cards/cards-view";
import { loadCards } from "@/lib/data/cards";
import { loadProfile } from "@/lib/data/finance";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cartões" };

export default async function CardsPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  const { cards, accounts } = await loadCards(supabase, profile);
  return <CardsView cards={cards} accounts={accounts} openNew={sp.novo === "1"} />;
}
