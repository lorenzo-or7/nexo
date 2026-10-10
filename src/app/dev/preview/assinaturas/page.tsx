import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SubscriptionsView } from "@/components/subscriptions/subscriptions-view";
import { isPreviewEnabled } from "@/lib/env";
import { buildSubscriptionItems } from "@/lib/data/subscriptions";
import { TODAY, quickEntry, subscriptionRows } from "../mock";

export default async function Preview({ searchParams }: { searchParams: Promise<{ nova?: string; vazio?: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const model = buildSubscriptionItems(sp.vazio ? [] : subscriptionRows(), quickEntry, TODAY);
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <SubscriptionsView {...model} data={quickEntry} openNew={sp.nova === "1"} />
    </AppShell>
  );
}
