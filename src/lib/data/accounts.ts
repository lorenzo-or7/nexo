import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountBalance } from "@/domain/ledger";
import type { Cents } from "@/domain/money";
import { buildTimeline, horizonEndOfMonth } from "@/domain/timeline";
import type { LocalDate } from "@/domain/dates";
import { loadDashboardInput, type Profile } from "./finance";

export interface AccountListItem {
  id: string;
  name: string;
  institutionKey: string | null;
  institutionName: string | null;
  type: string;
  color: string;
  openingBalance: Cents;
  openingDate: LocalDate;
  balance: Cents;
  projected: Cents;
  pending: number;
  paysCards: string[];
}

export async function loadAccounts(supabase: SupabaseClient, profile: Profile) {
  const input = await loadDashboardInput(supabase, profile, "month");
  const { base } = input;
  const { data: rows, error } = await supabase
    .from("accounts")
    .select("id,name,nickname,institution,institution_key,account_type,color,opening_balance_cents,opening_date")
    .is("archived_at", null)
    .order("sort_order")
    .order("created_at");
  if (error) throw new Error(`Falha ao carregar contas: ${error.message}`);
  const end = horizonEndOfMonth(base.today);

  const accounts: AccountListItem[] = (rows ?? []).map((r) => {
    const acc = base.accounts.find((a) => a.id === r.id)!;
    const started = acc.openingDate <= base.today;
    const balance = started ? accountBalance(acc, base.entries, base.today) : acc.openingBalance;
    const projected = started ? buildTimeline({ ...base, to: end, accountIds: [r.id] }).endBalance : acc.openingBalance;
    return {
      id: r.id,
      name: r.nickname || r.name,
      institutionKey: r.institution_key,
      institutionName: r.institution,
      type: r.account_type,
      color: r.color,
      openingBalance: Number(r.opening_balance_cents) as Cents,
      openingDate: r.opening_date,
      balance,
      projected,
      pending: base.entries.filter((e) => e.accountId === r.id && e.status !== "confirmed").length,
      paysCards: base.cards.filter((c) => c.paymentAccountId === r.id).map((c) => c.name),
    };
  });
  return { today: base.today, monthEnd: end, accounts };
}
