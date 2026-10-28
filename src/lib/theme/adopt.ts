import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePalette, PALETTE_COOKIE } from "./palettes";
import { THEME_COOKIE, normalizeTheme } from "./shared";

/**
 * Conta NOVA: leva para o perfil o tema e a paleta escolhidos na landing (guardados no cookie).
 * Só deve ser chamada logo após o cadastro; no login de uma conta existente a conta é quem manda
 * (ver syncThemeCookie), então nenhuma preferência salva é sobrescrita.
 */
export async function adoptLocalPreferences(supabase: SupabaseClient): Promise<void> {
  const store = await cookies();
  const theme = store.get(THEME_COOKIE)?.value;
  const palette = store.get(PALETTE_COOKIE)?.value;
  if (!theme && !palette) return;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  if (theme) await supabase.from("profiles").update({ theme: normalizeTheme(theme) }).eq("id", data.user.id);
  // coluna da paleta pode não existir ainda (migration opcional): ignora o erro
  if (palette) await supabase.from("profiles").update({ palette: normalizePalette(palette) }).eq("id", data.user.id);
}
