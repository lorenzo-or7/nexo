import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonthRef, clampedDate, daysInMonth, parseMonth, todayIn, type LocalDate } from "@/domain/dates";
import type { EntryKind, EntryStatus } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import { sanitizeSearch } from "@/domain/entries";
import type { Profile } from "./finance";

export interface AccountOption {
  id: string;
  name: string;
  institution: string | null;
  color: string;
  openingDate: LocalDate;
}
export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  kind: "expense" | "income";
}
export interface QuickEntryData {
  today: LocalDate;
  accounts: AccountOption[];
  categories: CategoryOption[];
}

/** Dados do formulário de lançamento (usados em todas as páginas). */
export const loadQuickEntryData = cache(async (supabase: SupabaseClient, profile: Profile): Promise<QuickEntryData> => {
  const [acc, cat] = await Promise.all([
    supabase.from("accounts").select("id,name,nickname,institution,color,opening_date").is("archived_at", null).order("sort_order").order("created_at"),
    supabase.from("categories").select("id,name,parent_id,kind,sort_order").is("archived_at", null).order("sort_order"),
  ]);
  if (acc.error || cat.error) throw new Error(`Falha ao carregar contas e categorias: ${(acc.error ?? cat.error)!.message}`);
  return {
    today: todayIn(profile.timezone),
    accounts: (acc.data ?? []).map((a) => ({
      id: a.id,
      name: a.nickname || a.name,
      institution: a.institution,
      color: a.color,
      openingDate: a.opening_date,
    })),
    categories: (cat.data ?? []).map((c) => ({ id: c.id, name: c.name, parentId: c.parent_id, kind: c.kind })),
  };
});

export interface EntryRow {
  id: string;
  version: number;
  date: LocalDate;
  kind: EntryKind;
  status: EntryStatus;
  amount: Cents;
  description: string | null;
  accountId: string;
  categoryId: string | null;
  paymentMethod: string | null;
  notes: string | null;
  tags: string[];
  transfer: { id: string; fromId: string; toId: string; amount: Cents } | null;
  cardId: string | null;
  invoiceRef: string | null;
}

export interface EntryFilters {
  month: string; // YYYY-MM
  accountId?: string;
  kind?: "income" | "expense" | "transfer" | "pending";
  categoryId?: string;
  q?: string;
}

export function parseFilters(sp: Record<string, string | undefined>, today: LocalDate): EntryFilters {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : today.slice(0, 7);
  const kind = (["income", "expense", "transfer", "pending"] as const).find((k) => k === sp.tipo);
  const uuid = /^[0-9a-f-]{36}$/i;
  return {
    month,
    accountId: uuid.test(sp.conta ?? "") ? sp.conta : undefined,
    kind,
    categoryId: uuid.test(sp.categoria ?? "") ? sp.categoria : undefined,
    q: sp.q ? sanitizeSearch(sp.q) || undefined : undefined,
  };
}

export function monthRange(month: string): { from: LocalDate; to: LocalDate } {
  const { y, m } = parseMonth(month);
  return { from: clampedDate(y, m, 1), to: clampedDate(y, m, daysInMonth(y, m)) };
}

/** Lançamentos do mês com filtros. Pendentes: todos os não realizados até o fim do mês. */
export async function loadEntries(supabase: SupabaseClient, f: EntryFilters, categories: CategoryOption[] = []): Promise<EntryRow[]> {
  const { from, to } = monthRange(f.month);
  let query = supabase
    .from("account_entries")
    .select("id,version,occurred_on,kind,status,amount_cents,description,account_id,category_id,payment_method,notes,transfer_id,card_id,invoice_ref")
    .is("deleted_at", null)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  query = f.kind === "pending" ? query.neq("status", "confirmed") : query.gte("occurred_on", from);
  if (f.kind === "income") query = query.in("kind", ["income", "refund"]);
  if (f.kind === "expense") query = query.in("kind", ["expense"]);
  if (f.kind === "transfer") query = query.eq("kind", "transfer");
  if (f.categoryId) {
    // categoria principal inclui as subcategorias
    const ids = [f.categoryId, ...categories.filter((c) => c.parentId === f.categoryId).map((c) => c.id)];
    query = query.in("category_id", ids);
  }
  if (f.q) query = query.or(`description.ilike.%${f.q}%,notes.ilike.%${f.q}%`);
  // filtro de conta: aplicado depois para manter os dois lados das transferências
  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar lançamentos: ${error.message}`);
  const rows = data ?? [];

  const ids = rows.map((r) => r.id);
  const tagMap = new Map<string, string[]>();
  if (ids.length) {
    const { data: et } = await supabase.from("entry_tags").select("entry_id, tags(name)").in("entry_id", ids.slice(0, 500));
    for (const r of (et ?? []) as unknown as { entry_id: string; tags: { name: string } | null }[]) {
      if (r.tags) tagMap.set(r.entry_id, [...(tagMap.get(r.entry_id) ?? []), r.tags.name]);
    }
  }

  // transferências: junta os dois lados numa linha
  const byTransfer = new Map<string, typeof rows>();
  for (const r of rows) if (r.transfer_id) byTransfer.set(r.transfer_id, [...(byTransfer.get(r.transfer_id) ?? []), r]);

  const out: EntryRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    let transfer: EntryRow["transfer"] = null;
    if (r.transfer_id) {
      const sides = byTransfer.get(r.transfer_id) ?? [r];
      const outSide = sides.find((s) => Number(s.amount_cents) < 0);
      const inSide = sides.find((s) => Number(s.amount_cents) > 0);
      if (f.accountId) {
        if (r.account_id !== f.accountId) continue;
      } else {
        if (seen.has(r.transfer_id)) continue;
        seen.add(r.transfer_id);
      }
      transfer = {
        id: r.transfer_id,
        fromId: outSide?.account_id ?? r.account_id,
        toId: inSide?.account_id ?? r.account_id,
        amount: Math.abs(Number(r.amount_cents)) as Cents,
      };
    } else if (f.accountId && r.account_id !== f.accountId) {
      continue;
    }
    out.push({
      id: r.id,
      version: r.version,
      date: r.occurred_on,
      kind: r.kind,
      status: r.status,
      amount: Number(r.amount_cents) as Cents,
      description: r.description,
      accountId: r.account_id,
      categoryId: r.category_id,
      paymentMethod: r.payment_method,
      notes: r.notes,
      tags: tagMap.get(r.id) ?? [],
      transfer,
      cardId: r.card_id,
      invoiceRef: r.invoice_ref,
    });
  }
  return out;
}

export const prevMonth = (m: string) => addMonthRef(m, -1);
export const nextMonth = (m: string) => addMonthRef(m, 1);
