"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidDate, parseDate, todayIn } from "@/domain/dates";
import { parseBRL } from "@/domain/money";
import { loadProfile } from "@/lib/data/finance";
import { requireUser } from "@/lib/supabase/server";

export type FixedIncomeActionResult = { ok: true; message: string } | { ok: false; error: string; field?: string } | undefined;

const uuidOrNull = z.string().transform((v) => v || null).pipe(z.uuid().nullable());
const dateOrNull = z.string().transform((v) => v || null).pipe(z.string().refine(isValidDate, "Data inválida").nullable());

const schema = z.object({
  id: uuidOrNull,
  kind: z.enum(["salary", "client"], { message: "Escolha o tipo" }),
  name: z.string().trim().min(1, "Dê um nome a esta renda").max(80, "Use até 80 caracteres"),
  client_name: z.string().trim().max(80, "Use até 80 caracteres"),
  amount: z.string().transform((v, ctx) => {
    try {
      const c = parseBRL(v);
      if (c <= 0) throw new Error();
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Informe o valor" });
      return z.NEVER;
    }
  }),
  start_date: z.string().refine(isValidDate, "Escolha a data do primeiro recebimento"),
  end_date: dateOrNull,
  account_id: z.uuid({ message: "Escolha a conta que recebe" }),
  category_id: uuidOrNull,
  notes: z.string().trim().max(500, "Use até 500 caracteres"),
});

const FIELDS = ["id", "kind", "name", "client_name", "amount", "start_date", "end_date", "account_id", "category_id", "notes"];
const ERR = "Não foi possível salvar a renda.";

export async function saveFixedIncome(_: FixedIncomeActionResult, form: FormData): Promise<FixedIncomeActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  const v = parsed.data;
  if (v.end_date && v.end_date < v.start_date) return { ok: false, error: "O fim não pode ser antes do primeiro recebimento", field: "end_date" };
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("save_fixed_income", {
    p_id: v.id,
    p_kind: v.kind,
    p_name: v.name,
    p_client: v.kind === "client" ? v.client_name : "",
    p_amount_cents: v.amount,
    p_day: parseDate(v.start_date).day,
    p_start: v.start_date,
    p_end: v.end_date,
    p_account: v.account_id,
    p_category: v.category_id,
    p_notes: v.notes,
  });
  if (error) return { ok: false, error: error.code === "PGRST202" || error.code === "PGRST205" ? "Rode a migration 12 (renda fixa) no Supabase." : ERR };
  revalidatePath("/", "layout");
  return { ok: true, message: v.id ? "Renda atualizada." : "Renda cadastrada." };
}

export async function changeFixedIncomeStatus(_: FixedIncomeActionResult, form: FormData): Promise<FixedIncomeActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  const action = z.enum(["pause", "resume"]).safeParse(form.get("action"));
  if (!id.success || !action.success) return { ok: false, error: "Pedido inválido." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("fixed_incomes").update({ status: action.data === "pause" ? "paused" : "active" }).eq("id", id.data);
  if (error) return { ok: false, error: ERR };
  revalidatePath("/", "layout");
  return { ok: true, message: action.data === "pause" ? "Renda pausada: não entra mais na previsão até retomar." : "Renda retomada." };
}

export async function removeFixedIncome(_: FixedIncomeActionResult, form: FormData): Promise<FixedIncomeActionResult> {
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { ok: false, error: "Renda inválida." };
  const { supabase } = await requireUser();
  const profile = await loadProfile(supabase);
  const { data, error } = await supabase.rpc("remove_fixed_income", { p_id: id.data, p_today: todayIn(profile.timezone) });
  if (error) return { ok: false, error: "Não foi possível excluir a renda." };
  revalidatePath("/", "layout");
  return { ok: true, message: data === "deleted" ? "Renda excluída." : "Ela já tinha recebimentos, então foi encerrada e o histórico ficou." };
}
