import { z } from "zod";

/**
 * Chave pública do Supabase. Projetos antigos chamam de "anon public";
 * os novos, de "Publishable key" (sb_publishable_...). As duas funcionam.
 * Lidas de forma literal para o Next embutir os valores no navegador.
 */
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
});

/** Variáveis públicas (seguras no navegador). Nunca coloque a service role aqui. */
export function publicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL?.trim() || undefined,
  });
  if (!parsed.success) {
    throw new Error(
      "Configuração do Supabase ausente ou inválida. Copie .env.example para .env.local e preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return parsed.data;
}

export function isSupabaseConfigured(): boolean {
  return /^https?:\/\/.+/.test(SUPABASE_URL) && SUPABASE_KEY.length >= 20;
}

/**
 * Prévia com dados fictícios (para desenvolvimento e testes de tela).
 * Desligada por padrão: o site real nunca mostra valores inventados.
 */
export function isPreviewEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXO_DEV_PREVIEW === "1";
}
