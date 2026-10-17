import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { invoiceRefForPurchase, type CardCharge } from "@/domain/billing";
import { categoryColor } from "@/domain/categories";
import { addDays, diffDays, maxDate, todayIn, type LocalDate } from "@/domain/dates";
import { billingConfigOf } from "@/domain/entries";
import type { AccountEntry } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import { monthlyEquivalent, priceAt, type Frequency, type Subscription, type SubscriptionStatus } from "@/domain/recurrence";
import { dueToRecord, frequencyLabel, nextCharge, perLabel, presetOf, subscriptionTotals, upcoming } from "@/domain/subscriptions";
import type { SubscriptionItem } from "@/components/subscriptions/subscription-dialogs";
import type { QuickEntryData } from "./ledger";
import type { Profile } from "./finance";

/** 'subscription' = assinatura (streaming, apps); 'bill' = conta fixa mensal (luz, condomínio, academia). */
export type RecurringKind = "subscription" | "bill";

export interface SubscriptionRow {
  sub: Subscription;
  kind: RecurringKind;
  payWith: "card" | "account";
  cardId: string | null;
  accountId: string | null;
  categoryId: string | null;
  color: string | null;
  renewalAlertDays: number;
  chargedThrough: LocalDate | null;
  /** períodos já lançados */
  keys: Set<string>;
  charges: { periodKey: string; dueOn: LocalDate; amount: Cents }[];
}

function n(v: unknown): Cents {
  const x = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(x)) throw new Error("Valor monetário inválido vindo do banco");
  return x as Cents;
}

/** Assinaturas com preços e cobranças já lançadas. Retorna null se a migration 11 ainda não foi aplicada. */
const SUB_COLUMNS =
  "id,name,category_id,frequency,interval_count,start_date,end_date,pay_with,card_id,account_id,status,paused_from,paused_until,cancelled_at,renewal_alert_days,color,charged_through";

/** A coluna `kind` vem da migration das contas fixas; sem ela, tudo é assinatura (como sempre foi). */
export async function kindColumnReady(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("subscriptions").select("kind").limit(1);
  return !(error && error.code === "42703");
}

export async function loadSubscriptionRows(supabase: SupabaseClient): Promise<SubscriptionRow[] | null> {
  const [first, prices, charges] = await Promise.all([
    supabase.from("subscriptions").select(`${SUB_COLUMNS},kind`).order("created_at"),
    supabase.from("subscription_prices").select("subscription_id,effective_from,amount_cents"),
    supabase.from("subscription_charges").select("subscription_id,period_key,due_on,amount_cents").order("due_on"),
  ]);
  let subs: { data: Record<string, any>[] | null; error: { code?: string; message: string } | null } = first; // eslint-disable-line @typescript-eslint/no-explicit-any
  // 42703 + "kind": a migration das contas fixas ainda não rodou; tenta de novo sem a coluna
  if (subs.error?.code === "42703" && /kind/i.test(subs.error.message)) {
    subs = await supabase.from("subscriptions").select(SUB_COLUMNS).order("created_at");
  }
  if (subs.error) {
    // 42703 = coluna inexistente (charged_through): migration 11 pendente
    if (subs.error.code === "42703" || subs.error.code === "42P01") return null;
    throw new Error(`Falha ao carregar assinaturas: ${subs.error.message}`);
  }
  if (prices.error || charges.error) throw new Error(`Falha ao carregar assinaturas: ${(prices.error ?? charges.error)!.message}`);

  return (subs.data ?? []).map((s) => {
    const own = (charges.data ?? []).filter((c) => c.subscription_id === s.id);
    return {
      kind: (s as { kind?: string }).kind === "bill" ? "bill" : "subscription",
      sub: {
        id: s.id,
        name: s.name,
        rule: { frequency: s.frequency as Frequency, interval: s.interval_count, startDate: s.start_date, endDate: s.end_date },
        prices: (prices.data ?? []).filter((p) => p.subscription_id === s.id).map((p) => ({ effectiveFrom: p.effective_from, amount: n(p.amount_cents) })),
        status: s.status as SubscriptionStatus,
        pausedFrom: s.paused_from,
        pausedUntil: s.paused_until,
        cancelledAt: s.cancelled_at,
      },
      payWith: s.pay_with,
      cardId: s.card_id,
      accountId: s.account_id,
      categoryId: s.category_id,
      color: s.color,
      renewalAlertDays: s.renewal_alert_days,
      chargedThrough: s.charged_through,
      keys: new Set(own.map((c) => c.period_key)),
      charges: own.map((c) => ({ periodKey: c.period_key, dueOn: c.due_on, amount: n(c.amount_cents) })),
    };
  });
}

/**
 * Lança as cobranças que já venceram (até hoje) — idempotente: o banco tem
 * UNIQUE(subscription_id, period_key). Roda uma vez por requisição.
 */
export const syncSubscriptions = cache(async (supabase: SupabaseClient, profile: Profile): Promise<number> => {
  const today = todayIn(profile.timezone);
  let rows: SubscriptionRow[] | null;
  try {
    rows = await loadSubscriptionRows(supabase);
  } catch {
    return 0;
  }
  if (!rows?.length) return 0;
  const pending = rows.filter((r) => r.sub.status !== "cancelled" || (r.sub.cancelledAt ?? "") > (r.chargedThrough ?? ""));
  if (!pending.length) return 0;

  const needCards = pending.some((r) => r.payWith === "card");
  const [cards, overrides] = needCards
    ? await Promise.all([
        supabase.from("cards").select("id,closing_day,due_day,closing_to_due_months,closing_day_rule"),
        supabase.from("invoice_overrides").select("card_id,invoice_ref,closing_date,due_date"),
      ])
    : [{ data: [] as Record<string, unknown>[] }, { data: [] as Record<string, unknown>[] }];

  let created = 0;
  for (const r of pending) {
    if (r.chargedThrough && r.chargedThrough >= today) continue;
    for (const o of dueToRecord(r.sub, r.chargedThrough, today, r.keys)) {
      let invoiceRef: string | null = null;
      if (r.payWith === "card") {
        const k = (cards.data ?? []).find((c) => c.id === r.cardId);
        if (!k) break;
        invoiceRef = invoiceRefForPurchase(
          billingConfigOf({
            closingDay: k.closing_day as number,
            dueDay: k.due_day as number,
            closingToDueMonths: (k.closing_to_due_months as 0 | 1 | null) ?? null,
            closingDayRule: k.closing_day_rule as "next_invoice" | "current_invoice",
            overrides: Object.fromEntries(
              (overrides.data ?? [])
                .filter((x) => x.card_id === k.id)
                .map((x) => [x.invoice_ref as string, { closingDate: (x.closing_date as string) ?? undefined, dueDate: (x.due_date as string) ?? undefined }]),
            ),
          }),
          o.date,
        );
      }
      const { error } = await supabase.rpc("record_subscription_charge", {
        p_subscription: r.sub.id,
        p_period_key: o.periodKey,
        p_due_on: o.date,
        p_amount_cents: o.amount,
        p_invoice_ref: invoiceRef,
        p_status: "confirmed",
      });
      if (error) return created;
      created++;
    }
    await supabase.from("subscriptions").update({ charged_through: today }).eq("id", r.sub.id);
  }
  return created;
});

export interface SubscriptionProjection {
  entries: AccountEntry[];
  cardCharges: CardCharge[];
}

/** Cobranças futuras como lançamentos agendados (conta) ou parcelas previstas (cartão). */
export function projectSubscriptions(
  rows: SubscriptionRow[],
  today: LocalDate,
  cardConfigs: Map<string, Parameters<typeof invoiceRefForPurchase>[0]>,
  days = 400,
): SubscriptionProjection {
  const to = addDays(today, days);
  const entries: AccountEntry[] = [];
  const cardCharges: CardCharge[] = [];
  for (const r of rows) {
    for (const o of upcoming(r.sub, r.chargedThrough, today, to, r.keys)) {
      const id = `sub:${r.sub.id}:${o.periodKey}`;
      if (r.payWith === "account" && r.accountId) {
        entries.push({ id, accountId: r.accountId, date: o.date, amount: -o.amount as Cents, kind: "expense", status: "scheduled", description: r.sub.name, categoryId: r.categoryId });
      } else if (r.payWith === "card" && r.cardId) {
        const cfg = cardConfigs.get(r.cardId);
        if (!cfg) continue;
        cardCharges.push({ id, cardId: r.cardId, invoiceRef: invoiceRefForPurchase(cfg, o.date), amount: o.amount, date: o.date, kind: "installment", installmentNumber: 1, installmentCount: 1, categoryId: r.categoryId });
      }
    }
  }
  return { entries, cardCharges };
}

/** Monta os cartões da tela de Assinaturas. */
export function buildSubscriptionItems(rows: SubscriptionRow[], data: QuickEntryData, today: LocalDate) {
  const items: SubscriptionItem[] = rows.map((r) => {
    const s = r.sub;
    const next = s.status === "active" ? nextCharge(s, maxDate(today, r.chargedThrough ? addDays(r.chargedThrough, 1) : today)) : null;
    const price = next?.amount ?? priceAt(s, today);
    const card = r.cardId ? data.cards.find((k) => k.id === r.cardId) : undefined;
    const account = r.accountId ? data.accounts.find((a) => a.id === r.accountId) : undefined;
    const cat = r.categoryId ? data.categories.find((c) => c.id === r.categoryId) : undefined;
    const color = r.color ?? (cat ? categoryColor(cat, data.categories) : categoryColor({ id: s.id, name: s.name, parentId: null, kind: "expense" }, []));
    return {
      id: s.id,
      kind: r.kind,
      name: s.name,
      status: s.status,
      price,
      per: perLabel(s.rule.frequency, s.rule.interval),
      frequencyLabel: frequencyLabel(s.rule.frequency, s.rule.interval),
      presetKey: presetOf(s.rule.frequency, s.rule.interval)?.key ?? "monthly",
      monthly: monthlyEquivalent(price, s.rule),
      nextDate: next?.date ?? null,
      daysToNext: next ? diffDays(next.date, today) : null,
      alertDays: r.renewalAlertDays,
      pay: r.payWith === "card" ? `card:${r.cardId}` : `account:${r.accountId}`,
      payLabel: card?.name ?? account?.name ?? (r.payWith === "card" ? "Cartão arquivado" : "Conta arquivada"),
      payColor: card?.color ?? account?.color ?? "#5C677D",
      categoryId: r.categoryId,
      categoryName: cat?.name ?? null,
      color,
      chargesCount: r.charges.length,
      totalPaid: r.charges.reduce((t, c) => t + c.amount, 0) as Cents,
      pausedFrom: s.pausedFrom ?? null,
      cancelledAt: s.cancelledAt ?? null,
      startDate: s.rule.startDate,
    };
  });
  const totals = subscriptionTotals(rows.map((r) => r.sub), today);
  const to = addDays(today, 30);
  const soon = rows.flatMap((r) => (r.sub.status === "active" ? upcoming(r.sub, r.chargedThrough, today, to, r.keys) : []));
  const next30 = { total: soon.reduce((t, o) => t + o.amount, 0) as Cents, count: soon.length };
  return { items, totals, next30 };
}
