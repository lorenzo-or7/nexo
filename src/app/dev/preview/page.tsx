import { notFound } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { AppShell } from "@/components/shell/app-shell";
import { Panel } from "@/components/ui/card";
import { buildDashboard } from "@/domain/dashboard";
import { demoScenario } from "@/domain/demo";
import type { Cents } from "@/domain/money";

/**
 * Pré-visualização SOMENTE em desenvolvimento: renderiza a interface com o
 * cenário demonstrativo em memória, sem Supabase. Retorna 404 em produção.
 */
export default async function Preview({ searchParams }: { searchParams: Promise<{ h?: string; vazio?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const horizon = (["30", "60", "90"].includes(sp.h ?? "") ? sp.h : "month") as "month" | "30" | "60" | "90";
  const base = demoScenario({ balanceAccountName: "Conta principal" });
  if (sp.vazio) {
    base.accounts = [];
    base.cards = [];
    base.entries = [];
  }
  const model = buildDashboard({
    base,
    accounts: sp.vazio ? [] : [{ id: "acc-main", name: "Conta principal", institution: "Nubank", color: "#C20F49", isDemo: true }],
    cards: sp.vazio
      ? []
      : [
          { id: "card-santander", name: "Santander", institution: "Santander", brand: "visa", lastFour: "4821", color: "#6B1030", limit: 200000 as Cents },
          { id: "card-nubank", name: "Nubank", institution: "Nubank", brand: "mastercard", lastFour: "0212", color: "#3A1B40", limit: 300000 as Cents },
        ],
    categories: [],
    reserve: 0 as Cents,
    safetyMargin: 0 as Cents,
    horizon,
  });
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null}>
      <DashboardView
        model={model}
        horizon={horizon}
        basePath="/dev/preview"
        name="Lucas"
        emptyState={<Panel className="max-w-2xl"><h2 className="text-xl font-semibold">Seu NEXO ainda está vazio</h2></Panel>}
      />
    </AppShell>
  );
}
