/**
 * Instituições com cores padrão para o cartão. As logos oficiais não são
 * embutidas no app: o usuário envia a imagem da logo ou do próprio cartão.
 */
export interface BankPreset {
  key: string;
  name: string;
  /** cor base salva no cartão */
  color: string;
  /** segundo tom do degradê */
  shade: string;
  /** cor do texto sobre o cartão */
  ink: string;
}

export const BANKS: readonly BankPreset[] = [
  { key: "nubank", name: "Nubank", color: "#820AD1", shade: "#4A0B82", ink: "#FFFFFF" },
  { key: "santander", name: "Santander", color: "#EC0000", shade: "#1A0000", ink: "#FFFFFF" },
  { key: "itau", name: "Itaú", color: "#EC7000", shade: "#A84B00", ink: "#FFFFFF" },
  { key: "inter", name: "Inter", color: "#FF7A00", shade: "#D94E00", ink: "#FFFFFF" },
  { key: "bradesco", name: "Bradesco", color: "#CC092F", shade: "#6E0019", ink: "#FFFFFF" },
  { key: "banco_do_brasil", name: "Banco do Brasil", color: "#F8D117", shade: "#E5AE00", ink: "#1E2A78" },
  { key: "caixa", name: "Caixa", color: "#005CA9", shade: "#003566", ink: "#FFFFFF" },
  { key: "c6", name: "C6 Bank", color: "#2B2B2B", shade: "#0A0A0A", ink: "#FFFFFF" },
  { key: "btg", name: "BTG Pactual", color: "#0B2A5B", shade: "#05152F", ink: "#FFFFFF" },
  { key: "xp", name: "XP", color: "#1F1F1F", shade: "#000000", ink: "#FFFFFF" },
  { key: "picpay", name: "PicPay", color: "#21C25E", shade: "#0E7A38", ink: "#FFFFFF" },
  { key: "mercado_pago", name: "Mercado Pago", color: "#00B1EA", shade: "#00639A", ink: "#FFFFFF" },
  { key: "outro", name: "Outra instituição", color: "#241127", shade: "#C20F49", ink: "#FFFFFF" },
];

export function bankByKey(key: string | null | undefined): BankPreset {
  return BANKS.find((b) => b.key === key) ?? BANKS.at(-1)!;
}

/** Escurece/clareia um hex para gerar o segundo tom de cores personalizadas. */
export function shadeHex(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 0xff;
    const out = amount < 0 ? v * (1 + amount) : v + (255 - v) * amount;
    return Math.round(Math.max(0, Math.min(255, out)));
  };
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Texto claro ou escuro conforme o contraste com a cor de fundo (WCAG). */
export function inkFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff);
  return L > 0.45 ? "#1A1A2E" : "#FFFFFF";
}

export const CARD_BRANDS = [
  { key: "visa", label: "Visa" },
  { key: "mastercard", label: "Mastercard" },
  { key: "elo", label: "Elo" },
  { key: "amex", label: "American Express" },
  { key: "hipercard", label: "Hipercard" },
  { key: "other", label: "Outra" },
] as const;

export function brandLabel(key: string): string {
  return CARD_BRANDS.find((b) => b.key === key)?.label ?? "";
}
