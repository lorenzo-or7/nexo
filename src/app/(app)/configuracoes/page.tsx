import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
import { DeleteAccountForm, DemoClear, DemoLoader, ExportButton, ProfileForm } from "@/components/settings/forms";
import { Panel, PanelHeader } from "@/components/ui/card";
import { formatBRL, type Cents } from "@/domain/money";
import { loadProfile } from "@/lib/data/finance";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configurações" };

const asInput = (c: number) => (c === 0 ? "" : formatBRL(c as Cents).replace("R$ ", ""));

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await loadProfile(supabase);
  const { count } = await supabase.from("accounts").select("id", { count: "exact", head: true }).eq("is_demo", true);
  const hasDemo = (count ?? 0) > 0;

  return (
    <>
      <PageHeader title="Configurações" subtitle="Perfil, projeções e seus dados." />
      <div className="grid max-w-3xl gap-6">
        <Panel>
          <PanelHeader title="Perfil e projeções" />
          <ProfileForm
            initial={{
              display_name: profile.display_name ?? "",
              timezone: profile.timezone,
              reserve: asInput(profile.reserve_cents),
              margin: asInput(profile.safety_margin_cents),
              include_expected_income: profile.include_expected_income,
            }}
          />
        </Panel>
        <Panel>
          <PanelHeader title="Dados de demonstração" description="Ficam marcados e separados dos seus dados reais." />
          {hasDemo ? <DemoClear /> : <DemoLoader />}
        </Panel>
        <Panel>
          <PanelHeader title="Exportar dados" description="Um arquivo JSON com tudo o que está na sua conta." />
          <ExportButton />
        </Panel>
        <Panel className="border-[color-mix(in_oklab,var(--negative)_30%,var(--border))]">
          <PanelHeader title="Excluir conta" />
          <DeleteAccountForm />
        </Panel>
      </div>
    </>
  );
}
