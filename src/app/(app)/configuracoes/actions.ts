"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIn } from "@/domain/dates";
import { CLEAR_ALL_PHRASE, CLEAR_ENTRIES_PHRASE } from "@/lib/data-management";
import { loadProfile } from "@/lib/data/finance";
import { requireUser } from "@/lib/supabase/server";

export type DataActionResult = { ok: true; message: string } | { ok: false; error: string } | undefined;


/** Apaga só os lançamentos (contas, cartões, categorias e preferências ficam). Frase exata exigida no servidor. */
export async function clearEntries(_: DataActionResult, form: FormData): Promise<DataActionResult> {
  if (form.get("confirm") !== CLEAR_ENTRIES_PHRASE) return { ok: false, error: `Digite exatamente: ${CLEAR_ENTRIES_PHRASE}` };
  const { supabase } = await requireUser();
  const profile = await loadProfile(supabase);
  const { error } = await supabase.rpc("clear_my_entries", { p_today: todayIn(profile.timezone) });
  if (error) return { ok: false, error: "Não foi possível limpar os lançamentos. Nada foi apagado; tente novamente." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Lançamentos removidos. Suas contas, cartões e categorias continuam aqui." };
}

/**
 * Apaga todos os dados financeiros do usuário (login e preferências ficam).
 * Exige a frase exata E a senha atual (reautenticação), e roda numa única transação no banco.
 */
export async function clearAllData(_: DataActionResult, form: FormData): Promise<DataActionResult> {
  if (form.get("confirm") !== CLEAR_ALL_PHRASE) return { ok: false, error: `Digite exatamente: ${CLEAR_ALL_PHRASE}` };
  const password = String(form.get("password") ?? "");
  if (!password) return { ok: false, error: "Informe sua senha para confirmar que é você." };
  const { supabase, user } = await requireUser();
  if (!user.email) return { ok: false, error: "Não foi possível confirmar sua identidade." };
  const re = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (re.error) return { ok: false, error: "Senha incorreta. Nada foi apagado." };
  const { error } = await supabase.rpc("clear_all_financial_data");
  if (error) return { ok: false, error: "Não foi possível limpar seus dados. Nada foi apagado; tente novamente." };
  revalidatePath("/", "layout");
  redirect("/?limpo=1");
}
