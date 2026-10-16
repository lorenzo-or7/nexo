import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/app-shell";
import { AppShell } from "@/components/shell/app-shell";
import { AppearanceForm } from "@/components/settings/appearance";
import { Panel, PanelHeader } from "@/components/ui/card";
import { isPreviewEnabled } from "@/lib/env";
import { quickEntry } from "../mock";

export default function Preview() {
  if (!isPreviewEnabled()) notFound();
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <PageHeader title="Configurações" subtitle="Aparência, perfil, projeções e seus dados." />
      <div className="grid max-w-3xl gap-6">
        <Panel>
          <PanelHeader title="Aparência" description="Escolha a paleta de cores e o modo claro ou escuro." />
          <AppearanceForm />
        </Panel>
      </div>
    </AppShell>
  );
}
