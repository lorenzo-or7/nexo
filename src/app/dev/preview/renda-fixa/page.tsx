import { notFound } from "next/navigation";
import { FixedIncomeView } from "@/components/fixed-income/fixed-income-view";
import { AppShell } from "@/components/shell/app-shell";
import type { Cents } from "@/domain/money";
import { buildFixedIncomeItems, type FixedIncomeRow } from "@/lib/data/fixed-income";
import { isPreviewEnabled } from "@/lib/env";
import { TODAY, quickEntry } from "../mock";

const A = quickEntry.accounts[0].id;
const rows = (): FixedIncomeRow[] => [
  { fixed: { id: "f1", kind: "salary", name: "Salário Ágere", clientName: null, amount: 520000 as Cents, dayOfMonth: 5, startDate: "2026-08-05", endDate: null, status: "active" }, accountId: A, categoryId: null, notes: null, keys: new Set(["2026-10"]), receivedCount: 2, receivedTotal: 1040000 as Cents },
  { fixed: { id: "f2", kind: "client", name: "Manutenção do site", clientName: "Namba", amount: 150000 as Cents, dayOfMonth: 20, startDate: "2026-10-20", endDate: "2027-03-20", status: "active" }, accountId: A, categoryId: null, notes: null, keys: new Set(), receivedCount: 0, receivedTotal: 0 as Cents },
  { fixed: { id: "f3", kind: "client", name: "Suporte mensal", clientName: "Platlog", amount: 90000 as Cents, dayOfMonth: 10, startDate: "2026-09-10", endDate: null, status: "paused" }, accountId: A, categoryId: null, notes: null, keys: new Set(["2026-09"]), receivedCount: 1, receivedTotal: 90000 as Cents },
];

export default async function Preview({ searchParams }: { searchParams: Promise<{ nova?: string; vazio?: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const model = buildFixedIncomeItems(sp.vazio ? [] : rows(), quickEntry, TODAY);
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <FixedIncomeView {...model} data={quickEntry} openNew={sp.nova === "1"} />
    </AppShell>
  );
}
