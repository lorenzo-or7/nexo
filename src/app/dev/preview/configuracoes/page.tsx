import { notFound } from "next/navigation";
import { isPreviewEnabled } from "@/lib/env";
import { DataManagement } from "@/components/settings/data-management";
import { DeleteAccountForm } from "@/components/settings/forms";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Panel, PanelHeader } from "@/components/ui/card";
import { quickEntry } from "../mock";

/** Pré-visualização do gerenciamento de dados (somente em desenvolvimento, sem Supabase). */
export default function Preview() {
  if (!isPreviewEnabled()) notFound();
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <PageHeader title="Configurações" subtitle="Aparência, perfil, projeções e seus dados." />
      <div className="grid max-w-3xl gap-6">
        <Panel>
          <PanelHeader title="Gerenciamento de dados" description="Exporte, recomece o histórico ou limpe tudo. Só os seus dados são afetados." />
          <DataManagement />
        </Panel>
        <Panel className="border-[color-mix(in_oklab,var(--negative)_30%,var(--border))]">
          <PanelHeader title="Excluir conta" />
          <DeleteAccountForm />
        </Panel>
      </div>
    </AppShell>
  );
}
