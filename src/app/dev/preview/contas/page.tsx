import { notFound } from "next/navigation";
import { AccountsView } from "@/components/accounts/accounts-view";
import { AppShell } from "@/components/shell/app-shell";
import { isPreviewEnabled } from "@/lib/env";
import { TODAY, accounts, quickEntry } from "../mock";

export default async function Preview({ searchParams }: { searchParams: Promise<{ nova?: string; vazio?: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <AccountsView accounts={sp.vazio ? [] : accounts} today={TODAY} monthEnd="2026-10-31" openNew={sp.nova === "1"} />
    </AppShell>
  );
}
