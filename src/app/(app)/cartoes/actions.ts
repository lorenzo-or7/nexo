"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BANKS, CARD_BRANDS, bankByKey } from "@/domain/banks";
import { parseBRL } from "@/domain/money";
import { CARD_IMAGES_BUCKET } from "@/lib/data/cards";
import { requireUser } from "@/lib/supabase/server";

export type CardActionResult =
  | { ok: true; message: string; id?: string }
  | { ok: false; error: string; field?: string }
  | undefined;

const MAX_IMAGE = 2 * 1024 * 1024;

const day = z.coerce.number().int().min(1, "Dia entre 1 e 31").max(31, "Dia entre 1 e 31");

const cardSchema = z.object({
  id: z.uuid().optional(),
  institution_key: z.enum(BANKS.map((b) => b.key) as [string, ...string[]]),
  name: z.string().trim().min(1, "Dê um nome ao cartão").max(60),
  brand: z.enum(CARD_BRANDS.map((b) => b.key) as [string, ...string[]]),
  last_four: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}$/.test(v), "Use só os 4 últimos dígitos")
    .transform((v) => v || null),
  limit_cents: z.string().transform((v, ctx) => {
    if (v.trim() === "") return 0;
    try {
      const c = parseBRL(v);
      if (c < 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Limite inválido" });
      return z.NEVER;
    }
  }),
  closing_day: day,
  due_day: day,
  closing_day_rule: z.enum(["next_invoice", "current_invoice"]),
  payment_account_id: z.string().transform((v) => v || null).pipe(z.uuid().nullable()),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
});

type ImageKind = "logo" | "art";

/** Confere o tipo real pelo conteúdo (assinatura do arquivo), não só pela extensão. */
async function readImage(file: File): Promise<{ bytes: Uint8Array; type: string; ext: string } | { error: string }> {
  if (file.size > MAX_IMAGE) return { error: "A imagem pode ter no máximo 2 MB" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const h = (i: number) => bytes[i];
  if (h(0) === 0x89 && h(1) === 0x50 && h(2) === 0x4e && h(3) === 0x47) return { bytes, type: "image/png", ext: "png" };
  if (h(0) === 0xff && h(1) === 0xd8 && h(2) === 0xff) return { bytes, type: "image/jpeg", ext: "jpg" };
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { bytes, type: "image/webp", ext: "webp" };
  return { error: "Use uma imagem PNG, JPG ou WebP" };
}

function fileFrom(form: FormData, name: string): File | null {
  const f = form.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}

export async function saveCard(_: CardActionResult, form: FormData): Promise<CardActionResult> {
  const parsed = cardSchema.safeParse({
    id: form.get("id") || undefined,
    institution_key: form.get("institution_key"),
    name: form.get("name"),
    brand: form.get("brand"),
    last_four: String(form.get("last_four") ?? ""),
    limit_cents: String(form.get("limit") ?? ""),
    closing_day: form.get("closing_day"),
    due_day: form.get("due_day"),
    closing_day_rule: form.get("closing_day_rule"),
    payment_account_id: String(form.get("payment_account_id") ?? ""),
    color: form.get("color"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }

  // valida imagens antes de gravar qualquer coisa
  const images: Partial<Record<ImageKind, { bytes: Uint8Array; type: string; ext: string }>> = {};
  for (const kind of ["logo", "art"] as const) {
    const f = fileFrom(form, kind);
    if (!f) continue;
    const img = await readImage(f);
    if ("error" in img) return { ok: false, error: img.error, field: kind };
    images[kind] = img;
  }

  const { supabase, user } = await requireUser();
  const { id, ...values } = parsed.data;
  const row = { ...values, institution: values.institution_key === "outro" ? null : bankByKey(values.institution_key).name };

  let cardId = id;
  let previous: { logo_path: string | null; art_path: string | null } = { logo_path: null, art_path: null };
  if (cardId) {
    const { data: current, error: readErr } = await supabase.from("cards").select("logo_path,art_path").eq("id", cardId).single();
    if (readErr || !current) return { ok: false, error: "Cartão não encontrado" };
    previous = current;
    const { error } = await supabase.from("cards").update(row).eq("id", cardId);
    if (error) return { ok: false, error: "Não foi possível salvar o cartão" };
  } else {
    const { data, error } = await supabase.from("cards").insert(row).select("id").single();
    if (error || !data) return { ok: false, error: "Não foi possível criar o cartão" };
    cardId = data.id as string;
  }

  // imagens: envia as novas, remove as substituídas ou marcadas para remoção
  const updates: Record<string, string | null> = {};
  const toDelete: string[] = [];
  for (const kind of ["logo", "art"] as const) {
    const column = `${kind}_path` as const;
    const img = images[kind];
    if (img) {
      const path = `${user.id}/${cardId}/${kind}-${Date.now()}.${img.ext}`;
      const { error } = await supabase.storage.from(CARD_IMAGES_BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: false });
      if (error) {
        revalidatePath("/cartoes");
        return { ok: false, error: `Cartão salvo, mas a imagem (${kind === "logo" ? "logo" : "arte"}) não foi enviada. Tente de novo.` };
      }
      updates[column] = path;
      if (previous[column]) toDelete.push(previous[column]!);
    } else if (form.get(`remove_${kind}`) === "on" && previous[column]) {
      updates[column] = null;
      toDelete.push(previous[column]!);
    }
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("cards").update(updates).eq("id", cardId);
    if (error) return { ok: false, error: "Cartão salvo, mas não foi possível atualizar as imagens" };
  }
  if (toDelete.length > 0) await supabase.storage.from(CARD_IMAGES_BUCKET).remove(toDelete);

  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Cartão atualizado." : "Cartão adicionado.", id: cardId };
}

export async function removeCard(_: CardActionResult, form: FormData): Promise<CardActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Cartão inválido" };
  const { supabase } = await requireUser();
  const { data: card } = await supabase.from("cards").select("logo_path,art_path").eq("id", id.data).single();
  const { data, error } = await supabase.rpc("remove_card", { p_card: id.data });
  if (error) return { ok: false, error: "Não foi possível remover o cartão" };
  if (data === "deleted" && card) {
    const paths = [card.logo_path, card.art_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from(CARD_IMAGES_BUCKET).remove(paths);
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: data === "deleted" ? "Cartão excluído." : "Cartão arquivado: ele tinha compras ou faturas, então o histórico foi mantido.",
  };
}
