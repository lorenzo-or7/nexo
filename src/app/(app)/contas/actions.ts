"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { BANKS, bankByKey } from "@/domain/banks";
import { isValidDate, todayIn } from "@/domain/dates";
import { adjustmentFor } from "@/domain/entries";
import { accountBalance } from "@/domain/ledger";
import { parseBRL, type Cents } from "@/domain/money";
import { requireUser } from "@/lib/supabase/server";

export type AccountActionResult = { ok: true; message: string } | { ok: false; error: string; field?: string } | undefined;

const money = (allowNegative: boolean) =>
  z.string().transform((v, ctx) => {
    if (v.trim() === "") return 0;
    try {
      const c = parseBRL(v);
      if (!allowNegative && c < 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const schema = z.object({
  id: z.string().transform((v) => v || undefined).pipe(z.uuid().optional()),
  institution_key: z.enum(BANKS.map((b) => b.key) as [string, ...string[]]),
  name: z.string().trim().min(1, "Dê um nome à conta").max(60),
  account_type: z.enum(["checking", "savings", "digital", "cash", "investment", "other"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida"),
  opening_balance_cents: money(true),
  opening_date: z.string().refine(isValidDate, "Data inválida"),
});

export async function saveAccount(_: AccountActionResult, form: FormData): Promise<AccountActionResult> {
  const parsed = schema.safeParse({
    id: String(form.get("id") ?? ""),
    institution_key: form.get("institution_key"),
    name: form.get("name"),
    account_type: form.get("account_type"),
    color: form.get("color"),
    opening_balance_cents: String(form.get("opening_balance") ?? ""),
    opening_date: form.get("opening_date"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const { id, ...v } = parsed.data;
  const row = { ...v, institution: v.institution_key === "outro" ? null : bankByKey(v.institution_key).name };
  const { supabase } = await requireUser();

  if (id) {
    // a nova data inicial não pode deixar lançamentos de fora do saldo
    const { data: earliest } = await supabase.from("account_entries").select("occurred_on").eq("account_id", id).is("deleted_at", null).order("occurred_on").limit(1);
    if (earliest?.[0] && earliest[0].occurred_on < v.opening_date) {
      return { ok: false, error: "Há lançamentos antes dessa data. Escolha uma data igual ou anterior ao primeiro lançamento.", field: "opening_date" };
    }
    const { error } = await supabase.from("accounts").update(row).eq("id", id);
    if (error) return { ok: false, error: "Não foi possível salvar a conta." };
  } else {
    const { error } = await supabase.from("accounts").insert(row);
    if (error) return { ok: false, error: "Não foi possível criar a conta." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Conta atualizada." : "Conta criada." };
}

export async function removeAccount(_: AccountActionResult, form: FormData): Promise<AccountActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Conta inválida." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("remove_account", { p_account: id.data });
  if (error) return { ok: false, error: "Não foi possível remover a conta." };
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: data === "deleted" ? "Conta excluída." : "Conta arquivada: ela tinha lançamentos, então o histórico foi mantido.",
  };
}

/** Informa o saldo que o banco mostra hoje; o NEXO lança a diferença como ajuste. */
export async function adjustBalance(_: AccountActionResult, form: FormData): Promise<AccountActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  const target = money(true).safeParse(String(form.get("target") ?? ""));
  if (!id.success) return { ok: false, error: "Conta inválida." };
  if (!target.success || String(form.get("target") ?? "").trim() === "") return { ok: false, error: "Informe o saldo atual do banco.", field: "target" };
  const { supabase } = await requireUser();
  const [{ data: profile }, { data: acc }, { data: entries }] = await Promise.all([
    supabase.from("profiles").select("timezone").single(),
    supabase.from("accounts").select("id,name,opening_balance_cents,opening_date").eq("id", id.data).single(),
    supabase.from("account_entries").select("id,account_id,occurred_on,amount_cents,kind,status").eq("account_id", id.data).is("deleted_at", null),
  ]);
  if (!acc) return { ok: false, error: "Conta não encontrada." };
  const today = todayIn(profile?.timezone ?? "America/Sao_Paulo");
  if (today < acc.opening_date) return { ok: false, error: "A conta ainda não começou (data do saldo inicial no futuro)." };
  const current = accountBalance(
    { id: acc.id, name: acc.name, openingBalance: Number(acc.opening_balance_cents) as Cents, openingDate: acc.opening_date },
    (entries ?? []).map((e) => ({ id: e.id, accountId: e.account_id, date: e.occurred_on, amount: Number(e.amount_cents) as Cents, kind: e.kind, status: e.status })),
    today,
  );
  const diff = adjustmentFor(current, target.data as Cents);
  if (diff === 0) return { ok: true, message: "O saldo já está certo. Nada foi lançado." };
  const { error } = await supabase.from("account_entries").insert({
    account_id: acc.id, kind: "adjustment", status: "confirmed", amount_cents: diff, occurred_on: today, description: "Ajuste de saldo",
  });
  if (error) return { ok: false, error: "Não foi possível ajustar o saldo." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saldo ajustado." };
}
