"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { todayIn } from "@/domain/dates";
import { parseBRL } from "@/domain/money";
import { DELETE_ACCOUNT_PHRASE } from "@/lib/data-management";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string } | undefined;

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Belem", "America/Fortaleza", "America/Recife", "America/Cuiaba", "America/Porto_Velho", "America/Rio_Branco", "America/Noronha"] as const;

export async function loadDemo(_: ActionResult, form: FormData): Promise<ActionResult> {
  const parsed = z
    .object({ account: z.string().trim().min(1, "Dê um nome para a conta").max(60), institution: z.string().trim().max(60) })
    .safeParse({ account: form.get("account"), institution: form.get("institution") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase } = await requireUser();
  const { data: profile } = await supabase.from("profiles").select("timezone").single();
  const { error } = await supabase.rpc("load_demo_data", {
    p_account_name: parsed.data.account,
    p_institution: parsed.data.institution || null,
    p_today: todayIn(profile?.timezone ?? "America/Sao_Paulo"),
  });
  if (error) return { ok: false, error: error.code === "23505" ? "Os dados de demonstração já estão carregados." : "Não foi possível carregar a demonstração." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Demonstração carregada." };
}

export async function clearDemo(): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("clear_demo_data");
  if (error) return { ok: false, error: "Não foi possível remover a demonstração." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Demonstração removida. Seus dados reais não foram alterados." };
}

export async function saveProfile(_: ActionResult, form: FormData): Promise<ActionResult> {
  const money = z.string().transform((v, ctx) => {
    if (v.trim() === "") return 0;
    try {
      const c = parseBRL(v);
      if (c < 0) throw new Error("negativo");
      return c;
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });
  const parsed = z
    .object({
      display_name: z.string().trim().min(1, "Informe seu nome").max(80),
      timezone: z.enum(TIMEZONES),
      reserve_cents: money,
      safety_margin_cents: money,
      include_expected_income: z.boolean(),
    })
    .safeParse({
      display_name: form.get("display_name"),
      timezone: form.get("timezone"),
      reserve_cents: String(form.get("reserve") ?? ""),
      safety_margin_cents: String(form.get("margin") ?? ""),
      include_expected_income: form.get("include_expected_income") === "on",
    });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferências salvas." };
}

/**
 * Exclui DEFINITIVAMENTE a conta (login e, em cascata, todos os dados financeiros). Irreversível.
 * Exige as três coisas no servidor: a frase exata, o aceite explícito e a senha atual (reautenticação).
 * A identidade vem só da sessão validada; nada do formulário diz qual conta apagar.
 */
export async function deleteAccount(_: ActionResult, form: FormData): Promise<ActionResult> {
  if (form.get("confirm") !== DELETE_ACCOUNT_PHRASE) return { ok: false, error: `Digite exatamente: ${DELETE_ACCOUNT_PHRASE}` };
  if (form.get("understood") !== "on") return { ok: false, error: "Marque a caixa para confirmar que entende que a exclusão é permanente." };
  const password = String(form.get("password") ?? "");
  if (!password) return { ok: false, error: "Informe sua senha para confirmar que é você." };
  const { supabase, user } = await requireUser();
  if (!user.email) return { ok: false, error: "Não foi possível confirmar sua identidade." };
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Exclusão indisponível: o servidor não tem a chave administrativa configurada." };
  }
  const re = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (re.error) return { ok: false, error: "Senha incorreta. Nada foi apagado." };
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, error: "Não foi possível excluir a conta agora. Nada foi apagado." };
  await supabase.auth.signOut();
  redirect("/entrar");
}
