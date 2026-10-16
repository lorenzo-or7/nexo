import type { Theme } from "./shared";

export type PaletteId = "nexo" | "violeta" | "laranja" | "ambar" | "turquesa" | "lima";

export interface PaletteInfo {
  id: PaletteId;
  name: string;
  /** cor de fundo do modo escuro e cor de destaque (mostradas como amostra no seletor) */
  base: string;
  accent: string;
  /** cor do navegador (barra do celular) em cada modo */
  themeColor: Record<Theme, string>;
}

export const PALETTE_COOKIE = "nexo-palette";
export const DEFAULT_PALETTE: PaletteId = "nexo";

export const PALETTES: PaletteInfo[] = [
  { id: "nexo", name: "Nexo", base: "#241127", accent: "#C20F49", themeColor: { dark: "#241127", light: "#EFE0E9" } },
  { id: "violeta", name: "Violeta", base: "#141B41", accent: "#F038FF", themeColor: { dark: "#141B41", light: "#EEEEF9" } },
  { id: "laranja", name: "Laranja", base: "#001621", accent: "#FF4103", themeColor: { dark: "#001621", light: "#F3EDEC" } },
  { id: "ambar", name: "Âmbar", base: "#101010", accent: "#FFBE0B", themeColor: { dark: "#101010", light: "#F4EFE2" } },
  { id: "turquesa", name: "Turquesa", base: "#101516", accent: "#54E6D4", themeColor: { dark: "#101516", light: "#E6F3F1" } },
  { id: "lima", name: "Lima", base: "#04301F", accent: "#BEF000", themeColor: { dark: "#04301F", light: "#EDF2DC" } },
];

export function normalizePalette(v: string | undefined | null): PaletteId {
  return PALETTES.some((p) => p.id === v) ? (v as PaletteId) : DEFAULT_PALETTE;
}

/** Logo (símbolo e logotipo) de cada paleta e modo. A paleta padrão usa os arquivos originais. */
export function brandAssets(palette: PaletteId, mode: Theme) {
  if (palette === "nexo") {
    return { mark: "/brand/mark-sm.png", markFull: "/brand/mark-full.png", wordmark: mode === "dark" ? "/brand/wordmark-on-dark.png" : "/brand/wordmark-on-light.png" };
  }
  const mark = `/brand/themes/mark-${palette}-${mode}.png`;
  return { mark, markFull: mark, wordmark: `/brand/themes/wordmark-${palette}-${mode}.png` };
}
