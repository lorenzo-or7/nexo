import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Encerra a sessão local (apaga os cookies) e volta ao login. Usado quando a sessão ficou inválida. */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // mesmo sem rede, seguimos apagando os cookies abaixo
  }
  const res = NextResponse.redirect(new URL("/entrar", request.url));
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
