import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { availableLimit, computeInvoices, type CardBillingConfig, type CardCharge, type CardPayment, type LimitRule } from "@/domain/billing";
import { todayIn, type LocalDate } from "@/domain/dates";
import type { Cents } from "@/domain/money";
import type { Profile } from "./finance";

export const CARD_IMAGES_BUCKET = "card-images";

export interface CardRow {
  id: string;
  name: string;
  nickname: string | null;
  institution: string | null;
  institution_key: string | null;
  brand: string;
  last_four: string | null;
  limit_cents: number;
  limit_rule: LimitRule;
  closing_day: number;
  due_day: number;
  closing_to_due_months: 0 | 1 | null;
  closing_day_rule: "next_invoice" | "current_invoice";
  payment_account_id: string | null;
  color: string;
  logo_path: string | null;
  art_path: string | null;
  is_demo: boolean;
}

export interface CardListItem {
  id: string;
  name: string;
  nickname: string | null;
  institutionKey: string | null;
  institutionName: string | null;
  brand: string;
  lastFour: string | null;
  color: string;
  limit: Cents;
  limitRule: LimitRule;
  closingDay: number;
  dueDay: number;
  closingDayRule: "next_invoice" | "current_invoice";
  paymentAccountId: string | null;
  paymentAccountName: string | null;
  logoUrl: string | null;
  artUrl: string | null;
  hasLogo: boolean;
  hasArt: boolean;
  isDemo: boolean;
  used: Cents;
  available: Cents;
  invoice: { ref: string; remaining: Cents; dueDate: LocalDate; closingDate: LocalDate; status: string } | null;
}

/** Gera URLs temporárias (1 h) para as imagens privadas, numa única chamada. */
export async function signImages(supabase: SupabaseClient, paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const out = new Map<string, string>();
  if (list.length === 0) return out;
  const { data } = await supabase.storage.from(CARD_IMAGES_BUCKET).createSignedUrls(list, 3600);
  for (const item of data ?? []) if (item.path && item.signedUrl) out.set(item.path, item.signedUrl);
  return out;
}

export async function loadCards(supabase: SupabaseClient, profile: Profile) {
  const today = todayIn(profile.timezone);
  const [cardsRes, accountsRes, chargesRes, paymentsRes, overridesRes] = await Promise.all([
    supabase.from("cards").select("*").is("archived_at", null).order("sort_order").order("created_at"),
    supabase.from("accounts").select("id,name,nickname").is("archived_at", null).order("sort_order"),
    supabase.from("card_charges").select("id,card_id,invoice_ref,amount_cents,occurred_on,kind").is("cancelled_at", null),
    supabase.from("account_entries").select("id,card_id,invoice_ref,amount_cents,occurred_on,account_id").eq("kind", "invoice_payment").eq("status", "confirmed").is("deleted_at", null),
    supabase.from("invoice_overrides").select("*"),
  ]);
  const err = cardsRes.error ?? accountsRes.error ?? chargesRes.error ?? paymentsRes.error ?? overridesRes.error;
  if (err) throw new Error(`Falha ao carregar cartões: ${err.message}`);

  const cards = (cardsRes.data ?? []) as CardRow[];
  const accounts = (accountsRes.data ?? []).map((a) => ({ id: a.id as string, name: ((a.nickname as string) || (a.name as string)) }));
  const urls = await signImages(supabase, cards.flatMap((c) => [c.logo_path, c.art_path]));

  const items: CardListItem[] = cards.map((c) => {
    const config: CardBillingConfig = {
      closingDay: c.closing_day,
      dueDay: c.due_day,
      closingToDueMonths: c.closing_to_due_months ?? undefined,
      closingDayRule: c.closing_day_rule,
      overrides: Object.fromEntries(
        (overridesRes.data ?? []).filter((o) => o.card_id === c.id).map((o) => [o.invoice_ref, { closingDate: o.closing_date ?? undefined, dueDate: o.due_date ?? undefined }]),
      ),
    };
    const charges: CardCharge[] = (chargesRes.data ?? [])
      .filter((x) => x.card_id === c.id)
      .map((x) => ({ id: x.id, cardId: c.id, invoiceRef: x.invoice_ref, amount: Number(x.amount_cents) as Cents, date: x.occurred_on, kind: x.kind }));
    const payments: CardPayment[] = (paymentsRes.data ?? [])
      .filter((x) => x.card_id === c.id)
      .map((x) => ({ id: x.id, cardId: c.id, invoiceRef: x.invoice_ref, amount: -Number(x.amount_cents) as Cents, date: x.occurred_on, accountId: x.account_id }));
    const invoices = computeInvoices(config, charges, payments, today);
    const current = invoices.find((i) => i.remaining > 0 && i.dueDate >= today) ?? invoices.find((i) => i.status === "overdue") ?? null;
    const limit = availableLimit(config, Number(c.limit_cents) as Cents, charges, payments, today, c.limit_rule);
    return {
      id: c.id,
      name: c.name,
      nickname: c.nickname,
      institutionKey: c.institution_key,
      institutionName: c.institution,
      brand: c.brand,
      lastFour: c.last_four,
      color: c.color,
      limit: Number(c.limit_cents) as Cents,
      limitRule: c.limit_rule,
      closingDay: c.closing_day,
      dueDay: c.due_day,
      closingDayRule: c.closing_day_rule,
      paymentAccountId: c.payment_account_id,
      paymentAccountName: accounts.find((a) => a.id === c.payment_account_id)?.name ?? null,
      logoUrl: c.logo_path ? urls.get(c.logo_path) ?? null : null,
      artUrl: c.art_path ? urls.get(c.art_path) ?? null : null,
      hasLogo: Boolean(c.logo_path),
      hasArt: Boolean(c.art_path),
      isDemo: c.is_demo,
      used: limit.used,
      available: limit.available,
      invoice: current
        ? { ref: current.ref, remaining: current.remaining, dueDate: current.dueDate, closingDate: current.closingDate, status: current.status }
        : null,
    };
  });
  return { today, cards: items, accounts };
}
