"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { adoptLocalPreferences } from "@/lib/theme/adopt";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme/shared";

export type FormState = { error?: string; success?: string; fields?: Record<string, string> } | undefined;

const email = z.email("Informe um e-mail válido").trim().toLowerCase();
const password = z
  .string()
  .min(8, "A senha precisa ter ao menos 8 caracteres")
  .max(72, "A senha pode ter no máximo 72 caracteres")
  .regex(/[A-Za-z]/, "Use ao menos uma letra")
  .regex(/\d/, "Use ao menos um número");

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

function notConfigured(): FormState {
  return { error: "O Supabase ainda não foi configurado neste ambiente (veja .env.example)." };
}

function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("fetch failed") || m.includes("network") || m.includes("enotfound") || m.includes("econnrefused"))
    return "Não foi possível conectar ao Supabase. Confira a URL no .env.local, sua internet e se o projeto não está pausado.";
  if (m.includes("invalid api key") || m.includes("no api key")) return "A chave do Supabase no .env.local está incorreta.";
  if (m.includes("database error")) return "O banco recusou o cadastro. Provavelmente faltam migrations: abra /diagnostico para conferir.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "Novos cadastros estão desativados no projeto Supabase.";
  if (m.includes("email address") && m.includes("invalid")) return "O Supabase recusou este e-mail. Use um endereço real.";
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("already registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("rate limit") || m.includes("security purposes")) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (m.includes("same as the old") || m.includes("different from the old")) return "A nova senha precisa ser diferente da atual.";
  if (m.includes("weak")) return "Senha muito fraca. Use letras, números e ao menos 8 caracteres.";
  return "Não foi possível concluir agora. Tente novamente.";
}

async function syncThemeCookie(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("profiles").select("theme").single();
  if (data?.theme) (await cookies()).set(THEME_COOKIE, normalizeTheme(data.theme), { path: "/", maxAge: 31536000, sameSite: "lax" });
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = z.object({ email, password: z.string().min(1, "Informe sua senha") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields: { email: String(form.get("email") ?? "") } };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: translate(error.message), fields: { email: parsed.data.email } };
  await syncThemeCookie(supabase);
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = z
    .object({ name: z.string().trim().min(1, "Como podemos te chamar?").max(80), email, password })
    .safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  const fields = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? "") };
  if (!parsed.success) return { error: parsed.error.issues[0].message, fields };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.name },
      emailRedirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm`,
    },
  });
  if (error) return { error: translate(error.message), fields };
  if (data.session) {
    await adoptLocalPreferences(supabase); // conta nova leva o tema escolhido na landing
    redirect("/"); // projeto sem confirmação obrigatória
  }
  return { success: `Enviamos um link de confirmação para ${parsed.data.email}. Abra-o para ativar sua conta.` };
}

export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/auth/redefinir-senha`,
  });
  if (error && /rate limit|security purposes/i.test(error.message)) return { error: translate(error.message) };
  // resposta igual exista ou não a conta (não revela e-mails cadastrados)
  return { success: "Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha." };
}

export async function updatePassword(_: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return notConfigured();
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem" })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "O link expirou. Peça um novo link de recuperação." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: translate(error.message) };
  redirect("/?senha=atualizada");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/entrar");
}
