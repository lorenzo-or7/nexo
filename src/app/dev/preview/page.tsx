import { notFound } from "next/navigation";
import { isPreviewEnabled } from "@/lib/env";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { AppShell } from "@/components/shell/app-shell";
import { quickEntry } from "./mock";
import { Panel } from "@/components/ui/card";
import { buildDashboard } from "@/domain/dashboard";
import { demoScenario } from "@/domain/demo";
import type { Cents } from "@/domain/money";

/**
 * Pré-visualização SOMENTE em desenvolvimento: renderiza a interface com o
 * cenário demonstrativo em memória, sem Supabase. Retorna 404 em produção.
 */
export default async function Preview({ searchParams }: { searchParams: Promise<{ h?: string; vazio?: string; cats?: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const horizon = (["30", "60", "90"].includes(sp.h ?? "") ? sp.h : "month") as "month" | "30" | "60" | "90";
  const base = demoScenario({ balanceAccountName: "Conta principal" });
  if (sp.vazio) {
    base.accounts = [];
    base.cards = [];
    base.entries = [];
  }
  // ?cats=1: despesas já realizadas em categorias e subcategorias (para testar o drill-down)
  const categories = sp.cats
    ? [
        { id: "c-transp", name: "Transporte", parentId: null as string | null, color: "#1C7ED6" },
        { id: "c-uber", name: "Uber", parentId: "c-transp" as string | null, color: "#4C6EF5" },
        { id: "c-gas", name: "Gasolina", parentId: "c-transp" as string | null, color: "#0B8A7A" },
        { id: "c-mercado", name: "Mercado", parentId: null as string | null, color: "#2F9E44" },
      ]
    : [];
  if (sp.cats) {
    const mk = (id: string, amount: number, categoryId: string | null, description: string) => ({
      id, accountId: "acc-main", date: "2026-10-02", amount: -amount as Cents, kind: "expense" as const, status: "confirmed" as const, description, categoryId,
    });
    base.entries = [
      ...base.entries,
      mk("x1", 3000, "c-uber", "Uber centro"),
      mk("x2", 2000, "c-uber", "Uber aeroporto"),
      mk("x3", 10000, "c-gas", "Posto"),
      mk("x4", 1500, "c-transp", "Estacionamento"),
      mk("x5", 8000, "c-mercado", "Feira"),
      mk("x6", 700, null, "Avulso"),
    ];
  }
  const model = buildDashboard({
    base,
    accounts: sp.vazio ? [] : [{ id: "acc-main", name: "Conta principal", institution: "Nubank", color: "#C20F49", isDemo: true }],
    cards: sp.vazio
      ? []
      : [
          { id: "card-santander", name: "Santander Unique", institution: "Santander", institutionKey: "santander", brand: "visa", lastFour: "4821", color: "#EC0000", limit: 200000 as Cents },
          { id: "card-nubank", name: "Nubank Ultravioleta", institution: "Nubank", institutionKey: "nubank", brand: "mastercard", lastFour: "0212", color: "#820AD1", limit: 300000 as Cents },
        ],
    categories,
    reserve: 0 as Cents,
    safetyMargin: 0 as Cents,
    horizon,
  });
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
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
