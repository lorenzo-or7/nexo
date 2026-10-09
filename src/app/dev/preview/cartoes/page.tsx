import { notFound } from "next/navigation";
import { isPreviewEnabled } from "@/lib/env";
import { CardsView } from "@/components/cards/cards-view";
import { AppShell } from "@/components/shell/app-shell";
import { quickEntry } from "../mock";
import type { Cents } from "@/domain/money";
import type { CardListItem } from "@/lib/data/cards";

/** Pré-visualização da tela de cartões (somente em desenvolvimento, sem Supabase). */
export default async function Preview({ searchParams }: { searchParams: Promise<{ novo?: string; vazio?: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const base = {
    nickname: null, limitRule: "full_amount" as const, closingDayRule: "next_invoice" as const,
    paymentAccountId: "acc", paymentAccountName: "Conta principal", logoUrl: null, artUrl: null,
    hasLogo: false, hasArt: false, isDemo: true,
  };
  const cards: CardListItem[] = sp.vazio ? [] : [
    { ...base, id: "00000000-0000-4000-8000-000000000001", name: "Nubank Ultravioleta", institutionKey: "nubank", institutionName: "Nubank", brand: "mastercard", lastFour: "0212", color: "#820AD1", limit: 300000 as Cents, closingDay: 13, dueDay: 20, used: 81488 as Cents, available: 218512 as Cents, invoice: { ref: "2026-10", remaining: 81488 as Cents, dueDate: "2026-10-20", closingDate: "2026-10-13", status: "open" } },
    { ...base, id: "00000000-0000-4000-8000-000000000002", name: "Santander Unique", institutionKey: "santander", institutionName: "Santander", brand: "visa", lastFour: "4821", color: "#EC0000", limit: 200000 as Cents, closingDay: 3, dueDay: 10, used: 54468 as Cents, available: 145532 as Cents, invoice: { ref: "2026-10", remaining: 54468 as Cents, dueDate: "2026-10-10", closingDate: "2026-10-03", status: "closed" } },
    { ...base, id: "00000000-0000-4000-8000-000000000003", name: "Cartão NEXO", institutionKey: "outro", institutionName: null, brand: "elo", lastFour: "7730", color: "#241127", limit: 0 as Cents, closingDay: 28, dueDay: 5, used: 0 as Cents, available: 0 as Cents, invoice: null, logoUrl: "/brand/mark-sm.png", hasLogo: true },
  ];
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <CardsView cards={cards} accounts={[{ id: "acc", name: "Conta principal" }]} openNew={sp.novo === "1"} />
    </AppShell>
  );
}
