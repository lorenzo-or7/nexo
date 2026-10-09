"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formatDateBR, isValidDate, todayIn } from "@/domain/dates";
import { checkStatusDate, parseTags, signedAmount } from "@/domain/entries";
import { parseBRL, type Cents } from "@/domain/money";
import { requireUser } from "@/lib/supabase/server";

export type EntryActionResult = { ok: true; message: string; again?: boolean } | { ok: false; error: string; field?: string } | undefined;

const uuid = z.uuid();
const optionalUuid = z.string().transform((v) => v || null).pipe(z.uuid().nullable());
const date = z.string().refine(isValidDate, "Data inválida");

const schema = z.object({
  id: z.string().optional().transform((v) => v || undefined).pipe(z.uuid().optional()),
  version: z.coerce.number().int().optional(),
  kind: z.enum(["expense", "income", "refund", "transfer"]),
  amount: z.string().transform((v, ctx) => {
    try {
      const c = parseBRL(v);
      if (c <= 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Informe um valor maior que zero" });
      return z.NEVER;
    }
  }),
  description: z.string().trim().max(140).transform((v) => v || null),
  account_id: uuid,
  to_account_id: optionalUuid,
  category_id: optionalUuid,
  occurred_on: date,
  status: z.enum(["confirmed", "scheduled", "expected"]),
  payment_method: z.string().transform((v) => v || null).pipe(z.enum(["pix", "debit", "cash", "boleto", "ted", "auto_debit", "other"]).nullable()),
  notes: z.string().trim().max(2000).transform((v) => v || null),
  tags: z.string().max(400),
  idempotency_key: z.string().max(80).transform((v) => v || null),
  transfer_id: optionalUuid,
});

function friendly(code: string | undefined, fallback: string): string {
  if (code === "40001") return "Este lançamento foi alterado em outra aba. Recarregue a página.";
  if (code === "23503") return "Conta ou categoria não encontrada.";
  if (code === "23514") return "Os valores não passaram na validação do banco.";
  return fallback;
}

export async function saveEntry(_: EntryActionResult, form: FormData): Promise<EntryActionResult> {
  const raw = Object.fromEntries(
    ["id", "version", "kind", "amount", "description", "account_id", "to_account_id", "category_id", "occurred_on", "status", "payment_method", "notes", "tags", "idempotency_key", "transfer_id"].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const parsed = schema.safeParse({ ...raw, version: raw.version || undefined });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const v = parsed.data;
  const { supabase } = await requireUser();

  const { data: profile } = await supabase.from("profiles").select("timezone").single();
  const today = todayIn(profile?.timezone ?? "America/Sao_Paulo");
  const statusError = checkStatusDate(v.status, v.occurred_on, today);
  if (statusError) return { ok: false, error: statusError, field: "status" };

  // a data não pode ser anterior ao saldo inicial da conta (não entraria no saldo)
  const accountIds = [v.account_id, v.to_account_id].filter(Boolean) as string[];
  const { data: accs, error: accErr } = await supabase.from("accounts").select("id,name,opening_date,archived_at").in("id", accountIds);
  if (accErr || !accs || accs.length !== new Set(accountIds).size) return { ok: false, error: "Conta não encontrada.", field: "account_id" };
  for (const a of accs) {
    if (v.occurred_on < a.opening_date) {
      return { ok: false, error: `A conta ${a.name} começa em ${formatDateBR(a.opening_date)}. Use uma data a partir dela ou ajuste o saldo inicial.`, field: "occurred_on" };
    }
  }

  const again = form.get("again") === "1";

  if (v.kind === "transfer") {
    if (!v.to_account_id) return { ok: false, error: "Escolha a conta de destino.", field: "to_account_id" };
    if (v.to_account_id === v.account_id) return { ok: false, error: "Escolha contas diferentes.", field: "to_account_id" };
    if (v.transfer_id) {
      const { error } = await supabase.rpc("edit_transfer", {
        p_id: v.transfer_id, p_from: v.account_id, p_to: v.to_account_id, p_amount_cents: v.amount,
        p_date: v.occurred_on, p_status: v.status, p_description: v.description, p_expected_version: v.version ?? null,
      });
      if (error) return { ok: false, error: friendly(error.code, "Não foi possível salvar a transferência.") };
    } else {
      const { error } = await supabase.rpc("create_transfer", {
        p_from: v.account_id, p_to: v.to_account_id, p_amount_cents: v.amount, p_date: v.occurred_on,
        p_status: v.status, p_description: v.description, p_idempotency_key: v.idempotency_key,
      });
      if (error) return { ok: false, error: friendly(error.code, "Não foi possível registrar a transferência.") };
    }
    revalidatePath("/", "layout");
    return { ok: true, message: v.transfer_id ? "Transferência atualizada." : "Transferência registrada.", again };
  }

  const row = {
    kind: v.kind,
    status: v.status,
    amount_cents: signedAmount(v.kind, v.amount as Cents),
    occurred_on: v.occurred_on,
    description: v.description,
    account_id: v.account_id,
    category_id: v.category_id,
    payment_method: v.payment_method,
    notes: v.notes,
  };

  let entryId = v.id;
  if (v.id) {
    let q = supabase.from("account_entries").update(row).eq("id", v.id).is("deleted_at", null).is("transfer_id", null);
    if (v.version) q = q.eq("version", v.version);
    const { data, error } = await q.select("id");
    if (error) return { ok: false, error: friendly(error.code, "Não foi possível salvar o lançamento.") };
    if (!data || data.length === 0) return { ok: false, error: friendly("40001", "") };
  } else {
    const { data, error } = await supabase.from("account_entries").insert({ ...row, idempotency_key: v.idempotency_key }).select("id").single();
    if (error?.code === "23505" && v.idempotency_key) {
      // mesma requisição enviada duas vezes: já está salvo
      const { data: existing } = await supabase.from("account_entries").select("id").eq("idempotency_key", v.idempotency_key).single();
      entryId = existing?.id;
    } else if (error || !data) {
      return { ok: false, error: friendly(error?.code, "Não foi possível registrar o lançamento.") };
    } else {
      entryId = data.id;
    }
  }

  if (entryId) {
    const { error } = await supabase.rpc("set_entry_tags", { p_entry: entryId, p_names: parseTags(v.tags) });
    if (error) {
      revalidatePath("/", "layout");
      return { ok: false, error: "Lançamento salvo, mas as tags não foram gravadas." };
    }
  }

  revalidatePath("/", "layout");
  const label = v.kind === "expense" ? "Despesa" : v.kind === "income" ? "Receita" : "Reembolso";
  return { ok: true, message: v.id ? `${label} atualizada.` : `${label} registrada.`, again };
}

export async function deleteEntry(_: EntryActionResult, form: FormData): Promise<EntryActionResult> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_entry", { p_entry: id.data });
  if (error) return { ok: false, error: "Não foi possível excluir o lançamento." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Lançamento excluído." };
}

export async function confirmEntry(_: EntryActionResult, form: FormData): Promise<EntryActionResult> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  const { supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("timezone").single();
  const today = todayIn(profile?.timezone ?? "America/Sao_Paulo");
  const { data: entry } = await supabase.from("account_entries").select("occurred_on").eq("id", id.data).single();
  if (!entry) return { ok: false, error: "Lançamento não encontrado." };
  // realizado hoje se a data prevista ainda não chegou; senão mantém a data
  const when = entry.occurred_on > today ? today : entry.occurred_on;
  const { error } = await supabase.rpc("confirm_entry", { p_entry: id.data, p_date: when });
  if (error) return { ok: false, error: "Não foi possível confirmar." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Marcado como realizado." };
}
