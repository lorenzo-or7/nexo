import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { publicEnv } from "@/lib/env";

/**
 * Cliente Supabase do servidor com a sessão do usuário (RLS aplicado).
 * `cache` reaproveita o mesmo cliente durante uma requisição (layout + página).
 */
export const createClient = cache(async () => {
  const env = publicEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
});

/** Usuário da sessão, validado no servidor de autenticação — uma única vez por requisição. */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** Retorna o usuário autenticado ou lança (para Server Actions). */
export async function requireUser() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  return { supabase, user };
}
