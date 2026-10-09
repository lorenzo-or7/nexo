import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { buildDashboard } from "@/domain/dashboard";
import { loadDashboardInput, loadProfile } from "@/lib/data/finance";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata: Metadata = { title: "Visão geral" };

const HORIZONS = ["month", "30", "60", "90"] as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const sp = await searchParams;
  const horizon = (HORIZONS as readonly string[]).includes(sp.h ?? "") ? (sp.h as (typeof HORIZONS)[number]) : "month";
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  const model = buildDashboard(await loadDashboardInput(supabase, profile, horizon));

  return (
    <DashboardView
      model={model}
      horizon={horizon}
      name={profile.display_name?.split(" ")[0] ?? "você"}
      demoNotice={
        model.hasDemo ? (
          <p className="mb-6 rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm text-ink-2">
            Você está vendo dados de demonstração. Remova-os em <Link href="/configuracoes" className="font-medium text-accent underline-offset-4 hover:underline">Configurações</Link> quando quiser.
          </p>
        ) : undefined
      }
      emptyState={
        <Panel className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">Tudo zerado, pronto para começar</h2>
          <p className="mt-2 text-ink-2">
            Esta tela mostra só os seus dados reais. Comece adicionando seus cartões, com o dia de fechamento e de vencimento de cada um.
          </p>
          <Button asChild className="mt-6">
            <Link href="/cartoes?novo=1"><Plus />Adicionar cartão</Link>
          </Button>
        </Panel>
      }
    />
  );
}
