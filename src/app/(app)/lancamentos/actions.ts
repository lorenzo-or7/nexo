"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildInstallments } from "@/domain/billing";
import { formatDateBR, formatMonthBR, isValidDate, todayIn } from "@/domain/dates";
import { billingConfigOf, checkStatusDate, parseTags, signedAmount } from "@/domain/entries";
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
  account_id: optionalUuid,
  to_account_id: optionalUuid,
  card_id: optionalUuid,
  installments: z.string().transform((v) => (v ? Number(v) : 1)).pipe(z.number().int().min(1, "Parcelas entre 1 e 48").max(48, "Parcelas entre 1 e 48")),
  category_id: optionalUuid,
  occurred_on: date,
  status: z.enum(["confirmed", "scheduled", "expected"]),
  payment_method: z.string().transform((v) => v || null).pipe(z.enum(["credit", "pix", "debit", "cash", "boleto", "ted", "auto_debit", "other"]).nullable()),
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
    ["id", "version", "kind", "amount", "description", "account_id", "to_account_id", "card_id", "installments", "category_id", "occurred_on", "status", "payment_method", "notes", "tags", "idempotency_key", "transfer_id"].map((k) => [k, String(form.get(k) ?? "")]),
  );
  const parsed = schema.safeParse({ ...raw, version: raw.version || undefined });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const v = parsed.data;
  const reimbRead = v.kind === "expense" && !v.id ? readReimbursement(form) : { on: false as const, error: null, data: null };
  if (reimbRead.error) return { ok: false, error: reimbRead.error, field: "reimb" };
  const reimbData = reimbRead.data;
  if (reimbData && reimbData.amount > v.amount) {
    return { ok: false, error: "A outra pessoa não pode pagar mais do que o valor da compra.", field: "reimb" };
  }
  const { supabase } = await requireUser();

  // compra no crédito: vai para a fatura do cartão, não sai da conta agora
  if (v.kind === "expense" && v.payment_method === "credit") {
    if (v.id) return { ok: false, error: "Para mudar uma compra no crédito, use a tela do cartão." };
    return saveCreditPurchase(supabase, v, form.get("again") === "1", reimbData);
  }
  if (!v.account_id) return { ok: false, error: "Escolha a conta.", field: "account_id" };
  const accountId = v.account_id;

  const { data: profile } = await supabase.from("profiles").select("timezone").single();
  const today = todayIn(profile?.timezone ?? "America/Sao_Paulo");
  const statusError = checkStatusDate(v.status, v.occurred_on, today);
  if (statusError) return { ok: false, error: statusError, field: "status" };

  // a data não pode ser anterior ao saldo inicial da conta (não entraria no saldo)
  const accountIds = [accountId, v.to_account_id].filter(Boolean) as string[];
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
    if (v.to_account_id === accountId) return { ok: false, error: "Escolha contas diferentes.", field: "to_account_id" };
    if (v.transfer_id) {
      const { error } = await supabase.rpc("edit_transfer", {
        p_id: v.transfer_id, p_from: accountId, p_to: v.to_account_id, p_amount_cents: v.amount,
        p_date: v.occurred_on, p_status: v.status, p_description: v.description, p_expected_version: v.version ?? null,
      });
      if (error) return { ok: false, error: friendly(error.code, "Não foi possível salvar a transferência.") };
    } else {
      const { error } = await supabase.rpc("create_transfer", {
        p_from: accountId, p_to: v.to_account_id, p_amount_cents: v.amount, p_date: v.occurred_on,
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
    account_id: accountId,
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
    if (!v.id && reimbData) {
      const msg = await addReimbursementFor(supabase, { entryId }, reimbData, v.idempotency_key ? `${v.idempotency_key}:r` : null);
      if (msg) {
        revalidatePath("/", "layout");
        return { ok: false, error: `Despesa registrada, mas: ${msg} Use "Alguém vai pagar" no extrato.` };
      }
    }
  }

  revalidatePath("/", "layout");
  const label = v.kind === "expense" ? "Despesa" : v.kind === "income" ? "Receita" : "Reembolso";
  return { ok: true, message: v.id ? `${label} atualizada.` : `${label} registrada.`, again };
}

type Parsed = z.infer<typeof schema>;

const reimbSchema = z.object({
  counterparty: z.string().trim().min(1, "Informe quem vai pagar").max(60),
  amount: z.string().transform((v, ctx) => {
    try {
      const c = parseBRL(v);
      if (c <= 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Informe quanto a pessoa vai pagar" });
      return z.NEVER;
    }
  }),
  date: z.string().refine(isValidDate, "Data do reembolso inválida"),
  account_id: z.uuid("Escolha a conta que recebe o reembolso"),
});

/** Lê os campos "Outra pessoa vai me pagar" do formulário (prefixo reimb_). */
function readReimbursement(form: FormData) {
  if (form.get("reimb_on") !== "on") return { on: false as const, error: null, data: null };
  const parsed = reimbSchema.safeParse({
    counterparty: form.get("reimb_who"),
    amount: String(form.get("reimb_amount") ?? ""),
    date: form.get("reimb_date"),
    account_id: form.get("reimb_account"),
  });
  if (!parsed.success) return { on: true as const, error: parsed.error.issues[0].message, data: null };
  return { on: true as const, error: null, data: parsed.data };
}

async function addReimbursementFor(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  origin: { purchaseId?: string; entryId?: string },
  r: z.infer<typeof reimbSchema>,
  key: string | null,
) {
  const { error } = await supabase.rpc("add_reimbursement", {
    p_purchase: origin.purchaseId ?? null,
    p_entry: origin.entryId ?? null,
    p_account: r.account_id,
    p_amount_cents: r.amount,
    p_date: r.date,
    p_counterparty: r.counterparty,
    p_status: "scheduled",
    p_idempotency_key: key,
  });
  if (!error) return null;
  if (error.message?.includes("passa do valor")) return "O reembolso não pode passar do valor da compra.";
  return "Não foi possível registrar o reembolso.";
}

async function saveCreditPurchase(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  v: Parsed,
  again: boolean,
  reimb: z.infer<typeof reimbSchema> | null,
): Promise<EntryActionResult> {
  if (!v.card_id) return { ok: false, error: "Escolha o cartão.", field: "card_id" };
  const [{ data: card }, { data: overrides }] = await Promise.all([
    supabase.from("cards").select("id,name,closing_day,due_day,closing_to_due_months,closing_day_rule").eq("id", v.card_id).is("archived_at", null).single(),
    supabase.from("invoice_overrides").select("invoice_ref,closing_date,due_date").eq("card_id", v.card_id),
  ]);
  if (!card) return { ok: false, error: "Cartão não encontrado.", field: "card_id" };
  const config = billingConfigOf({
    closingDay: card.closing_day,
    dueDay: card.due_day,
    closingToDueMonths: card.closing_to_due_months,
    closingDayRule: card.closing_day_rule,
    overrides: Object.fromEntries((overrides ?? []).map((o) => [o.invoice_ref, { closingDate: o.closing_date ?? undefined, dueDate: o.due_date ?? undefined }])),
  });
  // parcelas calculadas pelo motor; o banco confere a soma e a sequência das faturas
  const parts = buildInstallments(config, { purchaseId: "new", cardId: card.id, date: v.occurred_on, total: v.amount as Cents, installments: v.installments });
  const { data: purchaseId, error } = await supabase.rpc("create_credit_purchase", {
    p_card: card.id,
    p_description: v.description ?? "Compra no crédito",
    p_category: v.category_id,
    p_date: v.occurred_on,
    p_total_cents: v.amount,
    p_installments: parts.map((p) => ({ number: p.installmentNumber, invoice_ref: p.invoiceRef, amount_cents: p.amount })),
    p_first_invoice_manual: false,
    p_notes: v.notes,
    p_idempotency_key: v.idempotency_key,
  });
  if (error) return { ok: false, error: friendly(error.code, "Não foi possível registrar a compra no crédito.") };
  if (reimb && purchaseId) {
    const msg = await addReimbursementFor(supabase, { purchaseId: purchaseId as string }, reimb, v.idempotency_key ? `${v.idempotency_key}:r` : null);
    if (msg) {
      revalidatePath("/", "layout");
      return { ok: false, error: `Compra registrada, mas: ${msg} Use "Alguém vai pagar" no extrato.` };
    }
  }
  revalidatePath("/", "layout");
  const first = formatMonthBR(parts[0].invoiceRef);
  return {
    ok: true,
    message: v.installments > 1 ? `Compra em ${v.installments}x registrada no ${card.name}, a partir da fatura de ${first}.` : `Compra registrada na fatura de ${first} do ${card.name}.`,
    again,
  };
}

export async function deleteEntry(_: EntryActionResult, form: FormData): Promise<EntryActionResult> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  const { supabase } = await requireUser();
  if (form.get("source") === "card") {
    const { error } = await supabase.rpc("delete_purchase", { p_purchase: id.data });
    if (error) return { ok: false, error: "Não foi possível excluir a compra." };
    revalidatePath("/", "layout");
    return { ok: true, message: "Compra excluída. As parcelas saíram das faturas." };
  }
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

/** "Alguém vai pagar": cria o reembolso a receber para uma compra ou despesa já lançada. */
export async function addReimbursement(_: EntryActionResult, form: FormData): Promise<EntryActionResult> {
  const id = uuid.safeParse(form.get("origin_id"));
  if (!id.success) return { ok: false, error: "Lançamento inválido." };
  const parsed = reimbSchema.safeParse({
    counterparty: form.get("reimb_who"),
    amount: String(form.get("reimb_amount") ?? ""),
    date: form.get("reimb_date"),
    account_id: form.get("reimb_account"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();
  const isPurchase = form.get("origin_kind") === "card";
  const msg = await addReimbursementFor(supabase, isPurchase ? { purchaseId: id.data } : { entryId: id.data }, parsed.data, String(form.get("idempotency_key") || "") || null);
  if (msg) return { ok: false, error: msg };
  revalidatePath("/", "layout");
  return { ok: true, message: `${parsed.data.counterparty} vai te pagar. O valor entra na previsão.` };
}
