/**
 * Datas de calendário (sem hora) no formato ISO "YYYY-MM-DD".
 * Toda regra financeira trabalha com datas locais do usuário; o fuso
 * só é usado para descobrir "que dia é hoje" (ver `todayIn`).
 * Aritmética feita em UTC para nunca sofrer com horário de verão.
 */

export type LocalDate = string;

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(d: LocalDate): { y: number; m: number; day: number } {
  const match = RE.exec(d);
  if (!match) throw new Error(`Data inválida: ${d}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const day = Number(match[3]);
  if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m)) throw new Error(`Data inválida: ${d}`);
  return { y, m, day };
}

export function isValidDate(d: string): boolean {
  try {
    parseDate(d);
    return true;
  } catch {
    return false;
  }
}

export function makeDate(y: number, m: number, day: number): LocalDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Dia `day` do mês, limitado ao último dia (dia 31 em fevereiro → 28/29). */
export function clampedDate(y: number, m: number, day: number): LocalDate {
  return makeDate(y, m, Math.min(day, daysInMonth(y, m)));
}

function toEpochDay(d: LocalDate): number {
  const { y, m, day } = parseDate(d);
  return Date.UTC(y, m - 1, day) / 86_400_000;
}

function fromEpochDay(n: number): LocalDate {
  const dt = new Date(n * 86_400_000);
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromEpochDay(toEpochDay(d) + n);
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** Soma meses mantendo o dia "âncora" (31/01 + 1 mês = 28 ou 29/02). */
export function addMonths(d: LocalDate, n: number, anchorDay?: number): LocalDate {
  const { y, m, day } = parseDate(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return clampedDate(ny, nm, anchorDay ?? day);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO ordena lexicograficamente
}

export const minDate = (a: LocalDate, b: LocalDate) => (a <= b ? a : b);
export const maxDate = (a: LocalDate, b: LocalDate) => (a >= b ? a : b);

/** Mês de referência "YYYY-MM". */
export type MonthRef = string;

export function monthOf(d: LocalDate): MonthRef {
  return d.slice(0, 7);
}

export function parseMonth(ref: MonthRef): { y: number; m: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(ref);
  if (!match) throw new Error(`Mês inválido: ${ref}`);
  return { y: Number(match[1]), m: Number(match[2]) };
}

export function addMonthRef(ref: MonthRef, n: number): MonthRef {
  const { y, m } = parseMonth(ref);
  return addMonths(makeDate(y, m, 1), n).slice(0, 7);
}

export function eachDay(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Hoje" no fuso do usuário (padrão America/Sao_Paulo). */
export function todayIn(timeZone = "America/Sao_Paulo", now: Date = new Date()): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts; // en-CA já produz YYYY-MM-DD
}

export function formatDateBR(d: LocalDate): string {
  const { y, m, day } = parseDate(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function formatMonthBR(ref: MonthRef): string {
  const { y, m } = parseMonth(ref);
  return `${MONTHS[m - 1]}/${y}`;
}
