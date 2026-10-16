/**
 * Renda fixa: salário e mensalidades de clientes que se repetem todo mês.
 * Cada ocorrência tem chave de período "YYYY-MM"; o banco garante UNIQUE(fonte, mês),
 * então lançar duas vezes nunca duplica.
 */
import { addDays, type LocalDate } from "./dates";
import type { Cents } from "./money";
import { occurrences, type RecurrenceRule } from "./recurrence";

export type FixedIncomeKind = "salary" | "client";
export type FixedIncomeStatus = "active" | "paused" | "ended";

export const KIND_LABEL: Record<FixedIncomeKind, string> = { salary: "Salário", client: "Cliente" };

export interface FixedIncome {
  id: string;
  kind: FixedIncomeKind;
  name: string;
  clientName: string | null;
  amount: Cents;
  dayOfMonth: number;
  startDate: LocalDate;
  endDate: LocalDate | null;
  status: FixedIncomeStatus;
}

export interface FixedOccurrence {
  periodKey: string;
  date: LocalDate;
  amount: Cents;
}

/** Quantos dias para trás ainda lançamos recebimentos que não foram gerados (ex.: não abriu o app). */
export const BACKFILL_DAYS = 45;

function rule(f: FixedIncome): RecurrenceRule {
  return { frequency: "monthly", interval: 1, startDate: f.startDate, endDate: f.endDate };
}

/** Recebimentos da fonte entre duas datas (inclusive). Pausada/encerrada não gera nada. */
export function fixedOccurrences(f: FixedIncome, from: LocalDate, to: LocalDate): FixedOccurrence[] {
  if (f.status !== "active") return [];
  return occurrences(rule(f), from, to).map((date) => ({ periodKey: date.slice(0, 7), date, amount: f.amount }));
}

/** Meses que já venceram e ainda não viraram lançamento (últimos BACKFILL_DAYS até hoje). */
export function fixedDueToRecord(f: FixedIncome, today: LocalDate, existing: ReadonlySet<string>): FixedOccurrence[] {
  return fixedOccurrences(f, addDays(today, -BACKFILL_DAYS), today).filter((o) => !existing.has(o.periodKey));
}

/** Meses futuros (depois de hoje) para a projeção do saldo. */
export function fixedUpcoming(f: FixedIncome, today: LocalDate, to: LocalDate, existing: ReadonlySet<string>): FixedOccurrence[] {
  return fixedOccurrences(f, addDays(today, 1), to).filter((o) => !existing.has(o.periodKey));
}

export function nextFixedReceipt(f: FixedIncome, today: LocalDate, existing: ReadonlySet<string>): FixedOccurrence | null {
  if (f.status !== "active") return null;
  const horizon = addDays(today, 800);
  return fixedOccurrences(f, today, horizon).find((o) => o.date > today || !existing.has(o.periodKey)) ?? null;
}

export interface FixedIncomeTotals {
  monthly: Cents;
  salary: Cents;
  clients: Cents;
  yearly: Cents;
  activeCount: number;
}

export function fixedIncomeTotals(list: readonly FixedIncome[]): FixedIncomeTotals {
  let salary = 0;
  let clients = 0;
  let activeCount = 0;
  for (const f of list) {
    if (f.status !== "active") continue;
    activeCount++;
    if (f.kind === "salary") salary += f.amount;
    else clients += f.amount;
  }
  return { monthly: (salary + clients) as Cents, salary: salary as Cents, clients: clients as Cents, yearly: ((salary + clients) * 12) as Cents, activeCount };
}
