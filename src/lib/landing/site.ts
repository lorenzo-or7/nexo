/** Endereço público do site (usado em metadados, sitemap e robots). */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://nexo-gamma-one.vercel.app";
  return raw.replace(/\/+$/, "");
}
