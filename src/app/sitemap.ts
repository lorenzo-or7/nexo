import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/landing/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [{ url: `${base}/` }, { url: `${base}/entrar` }, { url: `${base}/cadastro` }];
}
