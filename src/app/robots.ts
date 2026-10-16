import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/landing/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/$", "/entrar", "/cadastro"], disallow: ["/api/", "/auth/", "/dev/", "/diagnostico", "/configuracoes", "/contas", "/cartoes", "/lancamentos", "/assinaturas", "/renda-fixa", "/categorias"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
