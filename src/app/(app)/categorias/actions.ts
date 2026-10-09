"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeCategoryName } from "@/domain/categories";
import { requireUser } from "@/lib/supabase/server";

export type CategoryActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; field?: string }
  | undefined;

const optionalUuid = z.string().transform((v) => v || null).pipe(z.uuid().nullable());

const schema = z.object({
  id: optionalUuid,
  name: z
    .string()
    .transform(normalizeCategoryName)
    .pipe(z.string().min(1, "Dê um nome à categoria").max(50, "Use até 50 caracteres")),
  kind: z.enum(["expense", "income"]),
  parent_id: optionalUuid,
  color: z
    .string()
    .transform((v) => v.toUpperCase() || null)
    .pipe(z.string().regex(/^#[0-9A-F]{6}$/, "Cor inválida").nullable()),
});

type Input = z.input<typeof schema>;

function friendly(error: { code?: string; message: string }): { error: string; field?: string } {
  if (error.code === "23505") return { error: "Já existe uma categoria com esse nome aqui.", field: "name" };
  if (error.code === "23514" && !error.message.includes("violates")) return { error: error.message };
  return { error: "Não foi possível salvar a categoria." };
}

async function save(input: Input): Promise<CategoryActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const { id, ...v } = parsed.data;
  const { supabase } = await requireUser();

  // subcategoria herda o tipo da principal
  let kind = v.kind;
  if (v.parent_id) {
    if (v.parent_id === id) return { ok: false, error: "A categoria não pode ficar dentro dela mesma.", field: "parent_id" };
    const { data: parent } = await supabase.from("categories").select("kind,parent_id").eq("id", v.parent_id).maybeSingle();
    if (!parent) return { ok: false, error: "Categoria principal não encontrada.", field: "parent_id" };
    if (parent.parent_id) return { ok: false, error: "Escolha uma categoria principal.", field: "parent_id" };
    kind = parent.kind;
  }

  // mesmo nome no mesmo nível (sem diferenciar maiúsculas)
  let dupQ = supabase.from("categories").select("id,archived_at").ilike("name", v.name.replace(/[\\%_]/g, (m) => `\\${m}`));
  dupQ = v.parent_id ? dupQ.eq("parent_id", v.parent_id) : dupQ.is("parent_id", null);
  const { data: dups } = await dupQ;
  const dup = (dups ?? []).find((d) => d.id !== id);
  if (dup) {
    if (!id && dup.archived_at) {
      // recriar uma categoria arquivada = trazer de volta
      const { error } = await supabase.from("categories").update({ archived_at: null, name: v.name, color: v.color, kind }).eq("id", dup.id);
      if (error) return { ok: false, ...friendly(error) };
      if (v.parent_id) await supabase.from("categories").update({ archived_at: null }).eq("id", v.parent_id);
      revalidatePath("/", "layout");
      return { ok: true, message: `“${v.name}” estava arquivada e voltou.`, id: dup.id };
    }
    return { ok: false, error: "Já existe uma categoria com esse nome aqui.", field: "name" };
  }

  const row = { name: v.name, kind, parent_id: v.parent_id, color: v.color };
  if (id) {
    const { error } = await supabase.from("categories").update(row).eq("id", id);
    if (error) return { ok: false, ...friendly(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: "Categoria atualizada.", id };
  }
  // vai para o fim da lista do seu nível
  let lastQ = supabase.from("categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
  lastQ = v.parent_id ? lastQ.eq("parent_id", v.parent_id) : lastQ.is("parent_id", null);
  const { data: last } = await lastQ;
  const { data, error } = await supabase
    .from("categories")
    .insert({ ...row, sort_order: (last?.[0]?.sort_order ?? -1) + 1 })
    .select("id")
    .single();
  if (error) return { ok: false, ...friendly(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Categoria criada.", id: data.id };
}

export async function saveCategory(_: CategoryActionResult, form: FormData): Promise<CategoryActionResult> {
  return save({
    id: String(form.get("id") ?? ""),
    name: String(form.get("name") ?? ""),
    kind: String(form.get("kind") ?? "") as "expense",
    parent_id: String(form.get("parent_id") ?? ""),
    color: String(form.get("color") ?? ""),
  });
}

/** Criação rápida (de dentro do formulário de lançamento). */
export async function createCategoryQuick(input: { name: string; kind: "expense" | "income"; parentId: string | null }): Promise<CategoryActionResult> {
  return save({ id: "", name: input.name, kind: input.kind, parent_id: input.parentId ?? "", color: "" });
}

export async function removeCategory(_: CategoryActionResult, form: FormData): Promise<CategoryActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Categoria inválida." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("remove_category", { p_category: id.data });
  if (error) return { ok: false, error: "Não foi possível remover a categoria." };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: data === "deleted" ? "Categoria excluída." : "Categoria arquivada: ela tinha lançamentos, então o histórico foi mantido.",
  };
}

export async function restoreCategory(_: CategoryActionResult, form: FormData): Promise<CategoryActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Categoria inválida." };
  const { supabase } = await requireUser();
  const { data: cat } = await supabase.from("categories").select("parent_id").eq("id", id.data).maybeSingle();
  if (!cat) return { ok: false, error: "Categoria não encontrada." };
  // a principal volta junto com as subcategorias; a sub traz a principal de volta
  const { error } = cat.parent_id
    ? await supabase.from("categories").update({ archived_at: null }).in("id", [id.data, cat.parent_id])
    : await supabase.from("categories").update({ archived_at: null }).or(`id.eq.${id.data},parent_id.eq.${id.data}`);
  if (error) return { ok: false, error: "Não foi possível restaurar a categoria." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Categoria restaurada." };
}
