import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryNode } from "@/domain/categories";

export interface CategoryItem extends CategoryNode {
  archived: boolean;
}

/** Todas as categorias do usuário, inclusive arquivadas (para a tela de gestão). */
export async function loadCategories(supabase: SupabaseClient): Promise<CategoryItem[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,parent_id,kind,color,archived_at,sort_order")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`Falha ao carregar categorias: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.parent_id,
    kind: c.kind,
    color: c.color,
    archived: c.archived_at !== null,
  }));
}
