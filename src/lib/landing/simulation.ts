import { formatBRL, type Cents } from "@/domain/money";

/**
 * Simulador da página inicial. Puro e sem efeitos: nada daqui toca em banco, rede ou sessão.
 * Valores em reais inteiros (o que o visitante digita) e resultados em centavos.
 */
export const SIM_DAYS = 30;
export const SIM_LIMITS = { min: 0, max: 1_000_000 } as const;
export const SIM_DEFAULTS = { initial: 5000, income: 3500, expense: 2200, incomeDay: 5, expenseDay: 10 } as const;

export interface SimInput {
  initial: number;
  income: number;
  expense: number;
  /** dia (1 a 30) em que o recebimento cai; só afeta a trajetória, não o saldo final */
  incomeDay: number;
  expenseDay: number;
}

export type SimStatus = "up" | "down" | "flat";

export interface SimResult {
  series: { day: number; balance: Cents }[];
  initial: Cents;
  final: Cents;
  delta: Cents;
  status: SimStatus;
  lowest: { day: number; balance: Cents };
  firstNegativeDay: number | null;
}

/** Aceita qualquer coisa (inclusive NaN/texto) e devolve um inteiro dentro dos limites. */
export function clampMoney(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SIM_LIMITS.min;
  return Math.min(SIM_LIMITS.max, Math.max(SIM_LIMITS.min, Math.round(n)));
}

export function clampDay(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(SIM_DAYS, Math.max(1, Math.round(n)));
}

/** Converte o texto digitado ("1.500", "R$ 2000", "abc") em reais inteiros válidos. */
export function parseMoneyText(text: string): number {
  const digits = text.replace(/\D/g, "").slice(0, 7);
  return digits === "" ? 0 : clampMoney(Number(digits));
}

export function simulate(raw: SimInput): SimResult {
  const initial = clampMoney(raw.initial) * 100;
  const income = clampMoney(raw.income) * 100;
  const expense = clampMoney(raw.expense) * 100;
  const incomeDay = clampDay(raw.incomeDay);
  const expenseDay = clampDay(raw.expenseDay);

  const series: SimResult["series"] = [];
  let balance = initial;
  let lowest = { day: 0, balance: initial as Cents };
  let firstNegativeDay: number | null = initial < 0 ? 0 : null;
  for (let day = 0; day <= SIM_DAYS; day++) {
    if (day === incomeDay) balance += income;
    if (day === expenseDay) balance -= expense;
    series.push({ day, balance: balance as Cents });
    if (balance < lowest.balance) lowest = { day, balance: balance as Cents };
    if (balance < 0 && firstNegativeDay === null) firstNegativeDay = day;
  }
  // saldo final = saldo inicial + receitas − despesas (a ordem dos dias não muda a soma)
  const final = initial + income - expense;
  const delta = final - initial;
  return {
    series,
    initial: initial as Cents,
    final: final as Cents,
    delta: delta as Cents,
    status: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    lowest,
    firstNegativeDay,
  };
}

/** Mensagem para leitores de tela e para o resumo na tela. */
export function describeResult(r: SimResult): string {
  const final = formatBRL(r.final);
  const delta = formatBRL(Math.abs(r.delta) as Cents);
  const head =
    r.status === "up"
      ? `Em 30 dias seu saldo sobe ${delta} e chega a ${final}.`
      : r.status === "down"
        ? `Em 30 dias seu saldo cai ${delta} e chega a ${final}.`
        : `Em 30 dias seu saldo fica igual, em ${final}.`;
  if (r.firstNegativeDay !== null) {
    return `${head} Atenção: no dia ${r.firstNegativeDay} o saldo fica negativo (${formatBRL(r.lowest.balance)} no ponto mais baixo).`;
  }
  return head;
}
