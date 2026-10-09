/** Categorias: árvore de dois níveis (principal → subcategorias). */

export type CategoryKind = "expense" | "income";

export interface CategoryNode {
  id: string;
  name: string;
  parentId: string | null;
  kind: CategoryKind;
  color?: string | null;
}

export const CATEGORY_COLORS = [
  "#C20F49", "#F25C8D", "#E8590C", "#D9A400", "#2F9E44", "#0B8A7A",
  "#1C7ED6", "#4C6EF5", "#7048E8", "#AE3EC9", "#6B4F3A", "#5C677D",
] as const;

/** Cor efetiva: a própria, senão a da principal, senão uma cor estável derivada do nome. */
export function categoryColor(c: CategoryNode, all: CategoryNode[]): string {
  if (c.color) return c.color;
  const parent = c.parentId ? all.find((p) => p.id === c.parentId) : undefined;
  if (parent?.color) return parent.color;
  const base = parent ?? c;
  let h = 0;
  for (const ch of base.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_COLORS[h % CATEGORY_COLORS.length];
}

export interface CategoryGroup<T extends CategoryNode = CategoryNode> {
  parent: T;
  children: T[];
}

/** Agrupa principais com suas subcategorias, mantendo a ordem recebida. */
export function categoryTree<T extends CategoryNode>(all: T[], kind?: CategoryKind): CategoryGroup<T>[] {
  return all
    .filter((c) => !c.parentId && (!kind || c.kind === kind))
    .map((parent) => ({ parent, children: all.filter((c) => c.parentId === parent.id) }));
}

/** Ids que um filtro por categoria cobre (principal inclui as subcategorias). */
export function categoryFilterIds(id: string, all: CategoryNode[]): string[] {
  return [id, ...all.filter((c) => c.parentId === id).map((c) => c.id)];
}

/** Normaliza o nome digitado: espaços extras, primeira letra maiúscula. */
export function normalizeCategoryName(raw: string): string {
  const t = raw.replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1) : t;
}

/** Já existe uma categoria com esse nome no mesmo nível? (o banco também recusa) */
export function hasNameConflict(all: CategoryNode[], name: string, parentId: string | null, exceptId?: string): boolean {
  const n = name.toLocaleLowerCase("pt-BR");
  return all.some((c) => c.id !== exceptId && (c.parentId ?? null) === (parentId ?? null) && c.name.toLocaleLowerCase("pt-BR") === n);
}
