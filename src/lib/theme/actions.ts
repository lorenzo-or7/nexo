"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { PALETTES, PALETTE_COOKIE } from "./palettes";
import { THEME_COOKIE } from "./shared";

const schema = z.enum(["light", "dark"]);

/** Persiste o tema no perfil do usuário (fonte de verdade) e no cookie (render sem "piscar"). */
export async function saveTheme(input: unknown): Promise<{ ok: true; persisted: boolean } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tema inválido" };
  const store = await cookies();
  store.set(THEME_COOKIE, parsed.data, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  if (!isSupabaseConfigured()) return { ok: true, persisted: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: true, persisted: false }; // páginas públicas: só cookie
  const { error } = await supabase.from("profiles").update({ theme: parsed.data }).eq("id", data.user.id);
  if (error) return { ok: false, error: "Não foi possível salvar o tema na sua conta" };
  return { ok: true, persisted: true };
}

const paletteSchema = z.enum(PALETTES.map((p) => p.id) as [string, ...string[]]);

/** Persiste a paleta de cores: cookie (sem "piscar") e perfil (outros dispositivos). */
export async function savePalette(input: unknown): Promise<{ ok: true; persisted: boolean } | { ok: false; error: string }> {
  const parsed = paletteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Paleta inválida" };
  const store = await cookies();
  store.set(PALETTE_COOKIE, parsed.data, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  if (!isSupabaseConfigured()) return { ok: true, persisted: false };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: true, persisted: false };
  const { error } = await supabase.from("profiles").update({ palette: parsed.data }).eq("id", data.user.id);
  // coluna ainda não criada (migration pendente): o cookie já vale neste aparelho
  if (error) return { ok: true, persisted: false };
  return { ok: true, persisted: true };
}
