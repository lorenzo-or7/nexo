import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CardBillingConfig, CardCharge, CardPayment } from "@/domain/billing";
import type { AccountMeta, CardMeta, CategoryMeta, DashboardInput } from "@/domain/dashboard";
import { todayIn } from "@/domain/dates";
import type { Account, AccountEntry } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import type { TimelineCard } from "@/domain/timeline";
import { signImages } from "./cards";
import { loadFixedIncomeRows, projectFixedIncome } from "./fixed-income";
import { loadSubscriptionRows, projectSubscriptions } from "./subscriptions";

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  theme: "light" | "dark" | "system";
  include_expected_income: boolean;
  reserve_cents: number;
  safety_margin_cents: number;
}

/** bigint do Postgres chega como number via PostgREST; garantimos inteiro. */
function c(v: unknown): Cents {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isSafeInteger(n)) throw new Error("Valor monetário inválido vindo do banco");
  return n as Cents;
}

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`Falha ao carregar dados: ${error.message}`);
  return data as T;
}

/** Perfil do usuário — buscado uma vez por requisição, mesmo se layout e página pedirem. */
export const loadProfile = cache(async (supabase: SupabaseClient): Promise<Profile> => {
  const first = await supabase.from("profiles").select("*").maybeSingle();
  if (first.error) throw new Error(`Falha ao carregar o perfil: ${first.error.message}`);
  if (first.data) return first.data as Profile;
  // conta criada antes das tabelas existirem: cria o perfil agora
  const { error } = await supabase.rpc("ensure_profile");
  if (error) throw new Error(`Falha ao criar o perfil: ${error.message}`);
  return must(supabase.from("profiles").select("*").single());
});

/**
 * Carrega todos os dados necessários para as projeções e mapeia para o domínio.
 * O RLS garante que só voltam linhas do usuário da sessão.
 */
export async function loadDashboardInput(
  supabase: SupabaseClient,
  profile: Profile,
  horizon: DashboardInput["horizon"],
): Promise<DashboardInput> {
  const today = todayIn(profile.timezone);
  const [accounts, cards, entries, charges, overrides, categories] = await Promise.all([
    must<Record<string, unknown>[]>(supabase.from("accounts").select("*").is("archived_at", null).order("sort_order")),
    must<Record<string, unknown>[]>(supabase.from("cards").select("*").is("archived_at", null).order("sort_order")),
    must<Record<string, unknown>[]>(supabase.from("account_entries").select("*").is("deleted_at", null)),
    must<Record<string, unknown>[]>(supabase.from("card_charges").select("*").is("cancelled_at", null)),
    must<Record<string, unknown>[]>(supabase.from("invoice_overrides").select("*")),
    must<Record<string, unknown>[]>(supabase.from("categories").select("id,name,parent_id,color")),
  ]);

  const domainAccounts: Account[] = accounts.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    openingBalance: c(a.opening_balance_cents),
    openingDate: a.opening_date as string,
  }));

  const domainEntries: AccountEntry[] = entries.map((e) => ({
    id: e.id as string,
    accountId: e.account_id as string,
    date: e.occurred_on as string,
    amount: c(e.amount_cents),
    kind: e.kind as AccountEntry["kind"],
    status: e.status as AccountEntry["status"],
    description: (e.description as string | null) ?? undefined,
    categoryId: (e.category_id as string | null) ?? null,
    transferId: (e.transfer_id as string | null) ?? undefined,
    cardId: (e.card_id as string | null) ?? undefined,
    invoiceRef: (e.invoice_ref as string | null) ?? undefined,
  }));

  // assinaturas: cobranças futuras entram na projeção (as vencidas já foram lançadas)
  const subRows = (await loadSubscriptionRows(supabase).catch(() => null)) ?? [];
  const configs = new Map<string, CardBillingConfig>();
  const timelineCards: TimelineCard[] = cards.map((k) => {
    const config: CardBillingConfig = {
      closingDay: k.closing_day as number,
      dueDay: k.due_day as number,
      closingToDueMonths: (k.closing_to_due_months as 0 | 1 | null) ?? undefined,
      closingDayRule: k.closing_day_rule as CardBillingConfig["closingDayRule"],
      overrides: Object.fromEntries(
        overrides
          .filter((o) => o.card_id === k.id)
          .map((o) => [o.invoice_ref as string, { closingDate: (o.closing_date as string) ?? undefined, dueDate: (o.due_date as string) ?? undefined }]),
      ),
    };
    configs.set(k.id as string, config);
    const cardCharges: CardCharge[] = charges
      .filter((x) => x.card_id === k.id)
      .map((x) => ({
        id: x.id as string,
        cardId: k.id as string,
        purchaseId: (x.purchase_id as string | null) ?? undefined,
        installmentNumber: (x.installment_number as number | null) ?? undefined,
        installmentCount: (x.installment_count as number | null) ?? undefined,
        invoiceRef: x.invoice_ref as string,
        amount: c(x.amount_cents),
        date: x.occurred_on as string,
        kind: x.kind as CardCharge["kind"],
      }));
    const payments: CardPayment[] = domainEntries
      .filter((e) => e.kind === "invoice_payment" && e.cardId === k.id && e.status === "confirmed")
      .map((e) => ({ id: e.id, cardId: k.id as string, invoiceRef: e.invoiceRef!, amount: -e.amount as Cents, date: e.date, accountId: e.accountId }));
    return {
      id: k.id as string,
      name: k.name as string,
      config,
      paymentAccountId: (k.payment_account_id as string | null) ?? null,
      charges: cardCharges,
      payments,
    };
  });

  const projected = projectSubscriptions(subRows, today, configs);
  domainEntries.push(...projected.entries.filter((e) => domainAccounts.some((a) => a.id === e.accountId)));
  for (const t of timelineCards) {
    t.charges = [...t.charges, ...projected.cardCharges.filter((x) => x.cardId === t.id)];
  }

  // renda fixa (salário e clientes): meses futuros entram como recebimentos previstos
  const fixedRows = (await loadFixedIncomeRows(supabase).catch(() => null)) ?? [];
  domainEntries.push(...projectFixedIncome(fixedRows, today).filter((e) => domainAccounts.some((a) => a.id === e.accountId)));

  const accountMeta: AccountMeta[] = accounts.map((a) => ({
    id: a.id as string,
    name: (a.nickname as string) || (a.name as string),
    institution: (a.institution as string | null) ?? null,
    color: a.color as string,
    isDemo: Boolean(a.is_demo),
  }));
  const urls = await signImages(supabase, cards.flatMap((k) => [k.logo_path as string | null, k.art_path as string | null]));
  const cardMeta: CardMeta[] = cards.map((k) => ({
    id: k.id as string,
    name: (k.nickname as string) || (k.name as string),
    institution: (k.institution as string | null) ?? null,
    brand: k.brand as string,
    lastFour: (k.last_four as string | null) ?? null,
    color: k.color as string,
    limit: c(k.limit_cents),
    institutionKey: (k.institution_key as string | null) ?? null,
    logoUrl: k.logo_path ? urls.get(k.logo_path as string) ?? null : null,
    artUrl: k.art_path ? urls.get(k.art_path as string) ?? null : null,
  }));
  const categoryMeta: CategoryMeta[] = categories.map((x) => ({
    id: x.id as string,
    name: x.name as string,
    parentId: (x.parent_id as string | null) ?? null,
    color: (x.color as string | null) ?? null,
  }));

  return {
    base: {
      today,
      to: today,
      accounts: domainAccounts,
      entries: domainEntries,
      cards: timelineCards,
      includeExpectedIncome: profile.include_expected_income,
    },
    accounts: accountMeta,
    cards: cardMeta,
    categories: categoryMeta,
    reserve: c(profile.reserve_cents),
    safetyMargin: c(profile.safety_margin_cents),
    horizon,
  };
}
