export type Theme = "light" | "dark";
export const THEME_COOKIE = "nexo-theme";
export function normalizeTheme(v: string | undefined | null): Theme {
  return v === "light" ? "light" : "dark";
}
