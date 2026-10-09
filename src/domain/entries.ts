/**
 * Regras do formulário de lançamentos (puras, testadas).
 * O usuário digita sempre um valor positivo; o sinal vem do tipo.
 */
import { compareDates, type LocalDate } from "./dates";
import { assertCents, type Cents } from "./money";
import type { EntryStatus } from "./ledger";

export type QuickKind = "expense" | "income" | "refund" | "transfer";

export const QUICK_KINDS: { key: QuickKind; label: string; short: string }[] = [
  { key: "expense", label: "Despesa", short: "Despesa" },
  { key: "income", label: "Receita", short: "Receita" },
  { key: "transfer", label: "Transferência", short: "Transf." },
  { key: "refund", label: "Reembolso", short: "Reemb." },
];

export const STATUS_LABEL: Record<EntryStatus, string> = {
  confirmed: "Realizada",
  scheduled: "Agendada",
  expected: "Prevista",
};

export const PAYMENT_METHODS = [
  { key: "pix", label: "Pix" },
  { key: "debit", label: "Débito" },
  { key: "cash", label: "Dinheiro" },
  { key: "boleto", label: "Boleto" },
  { key: "ted", label: "TED/DOC" },
  { key: "auto_debit", label: "Débito automático" },
  { key: "other", label: "Outro" },
] as const;

export function signedAmount(kind: Exclude<QuickKind, "transfer">, amount: Cents): Cents {
  assertCents(amount);
  if (amount <= 0) throw new Error("Informe um valor maior que zero");
  return (kind === "expense" ? -amount : amount) as Cents;
}

/**
 * Valida a combinação situação × data.
 * "Realizada" no futuro é contraditório: o saldo real só conta o que já aconteceu.
 */
export function checkStatusDate(status: EntryStatus, date: LocalDate, today: LocalDate): string | null {
  if (status === "confirmed" && compareDates(date, today) > 0) {
    return "Data futura: marque como agendada ou prevista.";
  }
  return null;
}

/** Situação padrão ao escolher uma data. */
export function defaultStatusFor(date: LocalDate, today: LocalDate, kind: QuickKind): EntryStatus {
  if (compareDates(date, today) <= 0) return "confirmed";
  return kind === "income" ? "expected" : "scheduled";
}

/** Lançamento de ajuste para que o saldo atual vire o saldo informado. */
export function adjustmentFor(current: Cents, target: Cents): Cents {
  assertCents(current);
  assertCents(target);
  return (target - current) as Cents;
}

/** Tags digitadas como "viagem, lazer" → lista limpa e sem repetição. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const t = raw.trim().replace(/\s+/g, " ").slice(0, 30);
    const key = t.toLocaleLowerCase("pt-BR");
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.slice(0, 10);
}

/** Texto de busca seguro para filtros do PostgREST. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
