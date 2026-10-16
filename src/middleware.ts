import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LANDING_PATH, shouldShowLanding } from "@/lib/landing/routing";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

const PUBLIC_PATHS = [LANDING_PATH, "/robots.txt", "/sitemap.xml", "/entrar", "/cadastro", "/recuperar-senha", "/auth", "/dev", "/diagnostico"];

export async function middleware(request: NextRequest) {
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isSupabaseConfigured()) {
    // sem configuração: só as páginas públicas funcionam (exibem o aviso de configuração)
    if (shouldShowLanding(pathname, false)) return NextResponse.rewrite(new URL(LANDING_PATH, request.url));
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

  // visitante na raiz: página inicial pública (reescrita; a URL continua "/")
  if (shouldShowLanding(pathname, !!user)) {
    const landing = NextResponse.rewrite(new URL(LANDING_PATH, request.url));
    for (const cookie of response.cookies.getAll()) landing.cookies.set(cookie);
    return landing;
  }
  if (!user && !isPublic) {
    const to = new URL("/entrar", request.url);
    if (pathname !== "/") to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }
  // Quem já está logado e abre /entrar é levado ao início pela própria página,
  // depois de confirmar a sessão no servidor (evita laço de redirecionamento
  // quando o token é válido localmente mas a conta não existe mais).
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|brand/|manifest.webmanifest|.*\\.(?:png|svg|jpg|webp)$).*)"],
};
