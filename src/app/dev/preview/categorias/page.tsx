import { notFound } from "next/navigation";
import { CategoriesView } from "@/components/categories/categories-view";
import { AppShell } from "@/components/shell/app-shell";
import { isPreviewEnabled } from "@/lib/env";
import { quickEntry } from "../mock";

export default async function Preview({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  if (!isPreviewEnabled()) notFound();
  const sp = await searchParams;
  const categories = [
    ...quickEntry.categories.map((c) => ({ ...c, archived: false })),
    { id: "00000000-0000-4000-8000-0000000000c9", name: "Academia antiga", parentId: null, kind: "expense" as const, color: null, archived: true },
  ];
  return (
    <AppShell user={{ name: "Pré-visualização", email: "dev@nexo.local" }} profileTheme={null} quickEntry={quickEntry}>
      <CategoriesView categories={categories} openNew={sp.nova === "1"} />
    </AppShell>
  );
}
