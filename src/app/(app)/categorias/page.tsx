import type { Metadata } from "next";
import { CategoriesView } from "@/components/categories/categories-view";
import { loadCategories } from "@/lib/data/categories";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Categorias" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const categories = await loadCategories(supabase);
  return <CategoriesView categories={categories} openNew={sp.nova === "1"} />;
}
