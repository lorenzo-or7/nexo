import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

const PUBLIC_PATHS = ["/entrar", "/cadastro", "/recuperar-senha", "/auth", "/dev", "/diagnostico"];

export async function middleware(request: NextRequest) {
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isSupabaseConfigured()) {
    // sem configuração: só as páginas públicas funcionam (exibem o aviso de configuração)
    if (isPublic) return NextResponse.next();
    return NextResponse.redirect(new URL("/entrar", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() valida a assinatura do JWT localmente (chaves públicas em cache),
  // sem ida ao servidor de autenticação a cada navegação. Renova a sessão quando expira.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;

  if (!user && !isPublic) {
    const to = new URL("/entrar", request.url);
    if (pathname !== "/") to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }
  if (user && (pathname === "/entrar" || pathname === "/cadastro")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|brand/|manifest.webmanifest|.*\\.(?:png|svg|jpg|webp)$).*)"],
};
