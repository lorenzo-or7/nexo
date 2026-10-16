import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryColor } from "@/domain/categories";
import { addDays, diffDays, todayIn, type LocalDate } from "@/domain/dates";
import {
  fixedDueToRecord,
  fixedIncomeTotals,
  fixedUpcoming,
  nextFixedReceipt,
  type FixedIncome,
  type FixedIncomeKind,
  type FixedIncomeStatus,
} from "@/domain/fixed-income";
import type { AccountEntry } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import type { FixedIncomeItem } from "@/components/fixed-income/fixed-income-dialogs";
import type { Profile } from "./finance";
import type { QuickEntryData } from "./ledger";

export interface FixedIncomeRow {
  fixed: FixedIncome;
  accountId: string;
  categoryId: string | null;
  notes: string | null;
  /** meses que já viraram lançamento (inclusive os excluídos: não voltam) */
  keys: Set<string>;
  receivedCount: number;
  receivedTotal: Cents;
}

function n(v: unknown): Cents {
  const x = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(x)) throw new Error("Valor monetário inválido vindo do banco");
  return x as Cents;
}

/** PostgREST: 42P01/PGRST205 = tabela inexistente (migration pendente); 42703/PGRST204 = coluna inexistente. */
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

/** Fontes de renda fixa. Retorna null se a migration ainda não foi aplicada. */
export async function loadFixedIncomeRows(supabase: SupabaseClient): Promise<FixedIncomeRow[] | null> {
  const [list, entries] = await Promise.all([
    supabase
      .from("fixed_incomes")
      .select("id,kind,name,client_name,amount_cents,day_of_month,start_date,end_date,account_id,category_id,notes,status")
      .order("created_at"),
    supabase.from("account_entries").select("fixed_income_id,fixed_income_period,status,amount_cents,deleted_at").not("fixed_income_id", "is", null),
  ]);
  const err = list.error ?? entries.error;
  if (err) {
    if (MISSING.has(err.code)) return null;
    throw new Error(`Falha ao carregar renda fixa: ${err.message}`);
  }
  return (list.data ?? []).map((f) => {
    const own = (entries.data ?? []).filter((e) => e.fixed_income_id === f.id);
    const received = own.filter((e) => e.status === "confirmed" && !e.deleted_at);
    return {
      fixed: {
        id: f.id,
        kind: f.kind as FixedIncomeKind,
        name: f.name,
        clientName: f.client_name,
        amount: n(f.amount_cents),
        dayOfMonth: f.day_of_month,
        startDate: f.start_date,
        endDate: f.end_date,
        status: f.status as FixedIncomeStatus,
      },
      accountId: f.account_id,
      categoryId: f.category_id,
      notes: f.notes,
      keys: new Set(own.map((e) => e.fixed_income_period as string)),
      receivedCount: received.length,
      receivedTotal: received.reduce((t, e) => t + n(e.amount_cents), 0) as Cents,
    };
  });
}

/**
 * Lança como PREVISTOS os recebimentos que já venceram (você confirma com "Realizado").
 * Idempotente: o banco tem UNIQUE(fonte, mês). Roda uma vez por requisição.
 */
export const syncFixedIncome = cache(async (supabase: SupabaseClient, profile: Profile): Promise<number> => {
  const today = todayIn(profile.timezone);
  let rows: FixedIncomeRow[] | null;
  try {
    rows = await loadFixedIncomeRows(supabase);
  } catch {
    return 0;
  }
  if (!rows?.length) return 0;
  let created = 0;
  for (const r of rows) {
    for (const o of fixedDueToRecord(r.fixed, today, r.keys)) {
      const { error } = await supabase.rpc("record_fixed_income_entry", { p_id: r.fixed.id, p_period: o.periodKey, p_date: o.date });
      if (error) return created;
      created++;
    }
  }
  return created;
});

/** Recebimentos futuros como lançamentos previstos, só para a projeção do saldo. */
export function projectFixedIncome(rows: FixedIncomeRow[], today: LocalDate, days = 400): AccountEntry[] {
  const to = addDays(today, days);
  const out: AccountEntry[] = [];
  for (const r of rows) {
    for (const o of fixedUpcoming(r.fixed, today, to, r.keys)) {
      out.push({
        id: `fi:${r.fixed.id}:${o.periodKey}`,
        accountId: r.accountId,
        date: o.date,
        amount: o.amount,
        kind: "income",
        status: "expected",
        description: r.fixed.name,
        categoryId: r.categoryId,
      });
    }
  }
  return out;
}

export function buildFixedIncomeItems(rows: FixedIncomeRow[], data: QuickEntryData, today: LocalDate) {
  const items: FixedIncomeItem[] = rows.map((r) => {
    const f = r.fixed;
    const next = nextFixedReceipt(f, today, r.keys);
    const account = data.accounts.find((a) => a.id === r.accountId);
    const cat = r.categoryId ? data.categories.find((c) => c.id === r.categoryId) : undefined;
    return {
      id: f.id,
      kind: f.kind,
      name: f.name,
      clientName: f.clientName,
      amount: f.amount,
      dayOfMonth: f.dayOfMonth,
      startDate: f.startDate,
      endDate: f.endDate,
      status: f.status,
      accountId: r.accountId,
      accountName: account?.name ?? "Conta arquivada",
      accountColor: account?.color ?? "#5C677D",
      categoryId: r.categoryId,
      categoryName: cat?.name ?? null,
      color: cat ? categoryColor(cat, data.categories) : f.kind === "salary" ? "#2F9E44" : "#4C6EF5",
      notes: r.notes,
      nextDate: next?.date ?? null,
      daysToNext: next ? diffDays(next.date, today) : null,
      receivedCount: r.receivedCount,
      receivedTotal: r.receivedTotal,
    };
  });
  const totals = fixedIncomeTotals(rows.map((r) => r.fixed));
  const to = addDays(today, 60);
  const upcoming = rows
    .flatMap((r) => {
      const pending = fixedUpcoming(r.fixed, addDays(today, -1), to, r.keys);
      return pending.map((o) => ({ id: `${r.fixed.id}:${o.periodKey}`, name: r.fixed.name, kind: r.fixed.kind, date: o.date, amount: o.amount }));
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  return { items, totals, upcoming };
}
