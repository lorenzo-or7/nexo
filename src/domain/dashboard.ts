/**
 * Monta o modelo da tela inicial a partir dos dados reais (já carregados do banco).
 * Função pura e serializável: tudo que aparece no dashboard é derivado daqui.
 */
import { computeInvoices } from "./billing";
import { addDays, monthOf, type LocalDate } from "./dates";
import { accountBalance, incomeTotal, spendingLines, type AccountEntry } from "./ledger";
import { sum, type Cents } from "./money";
import { buildTimeline, freeToSpend, horizonEndOfMonth, type TimelineInput, type TimelineStatus } from "./timeline";

export interface AccountMeta {
  id: string;
  name: string;
  institution: string | null;
  color: string;
  isDemo: boolean;
}
export interface CardMeta {
  id: string;
  name: string;
  institution: string | null;
  brand: string;
  lastFour: string | null;
  color: string;
  limit: Cents;
  institutionKey?: string | null;
  logoUrl?: string | null;
  artUrl?: string | null;
}
export interface CategoryMeta {
  id: string;
  name: string;
  parentId: string | null;
}

export interface DashboardInput {
  base: TimelineInput;
  accounts: AccountMeta[];
  cards: CardMeta[];
  categories: CategoryMeta[];
  reserve: Cents;
  safetyMargin: Cents;
  horizon: "month" | "30" | "60" | "90";
}

export interface DashboardModel {
  today: LocalDate;
  horizonEnd: LocalDate;
  hasData: boolean;
  hasDemo: boolean;
  totals: {
    bankBalance: Cents;
    toReceive: Cents;
    toPay: Cents;
    openInvoices: Cents;
    closedUnpaid: Cents;
    monthExpenses: Cents;
    monthIncome: Cents;
    projected: Cents;
    free: Cents;
    lowest: Cents;
    lowestDate: LocalDate;
    firstNegativeDate: LocalDate | null;
    reserve: Cents;
  };
  accounts: (AccountMeta & { balance: Cents })[];
  cards: (CardMeta & { currentInvoice: Cents; currentDue: LocalDate | null; status: string })[];
  upcoming: { date: LocalDate; label: string; amount: Cents; status: TimelineStatus; originalDate?: LocalDate }[];
  series: { date: LocalDate; balance: number }[];
  recent: { id: string; date: LocalDate; label: string; amount: Cents; kind: string }[];
  byCategory: { name: string; amount: Cents }[];
}

export function horizonDate(today: LocalDate, h: DashboardInput["horizon"]): LocalDate {
  if (h === "month") return horizonEndOfMonth(today);
  return addDays(today, Number(h));
}

export function buildDashboard(input: DashboardInput): DashboardModel {
  const { base } = input;
  const today = base.today;
  const to = horizonDate(today, input.horizon);
  const timeline = buildTimeline({ ...base, to });
  const free = freeToSpend(timeline, { reserve: input.reserve, safetyMargin: input.safetyMargin });

  const accounts = input.accounts.map((a) => {
    const acc = base.accounts.find((x) => x.id === a.id)!;
    return { ...a, balance: acc.openingDate <= today ? accountBalance(acc, base.entries, today) : acc.openingBalance };
  });

  let openInvoices = 0;
  let closedUnpaid = 0;
  const cards = input.cards.map((meta) => {
    const c = base.cards.find((x) => x.id === meta.id)!;
    const invoices = computeInvoices(c.config, c.charges, c.payments, today);
    let current: (typeof invoices)[number] | undefined;
    for (const inv of invoices) {
      if (inv.status === "open") openInvoices += inv.remaining;
      if (inv.status === "closed" || inv.status === "overdue") closedUnpaid += inv.remaining;
      if (!current && inv.remaining > 0 && inv.dueDate >= today) current = inv;
    }
    return {
      ...meta,
      currentInvoice: (current?.remaining ?? 0) as Cents,
      currentDue: current?.dueDate ?? null,
      status: current?.status ?? "paid",
    };
  });

  const flows = timeline.events.filter((e) => e.status !== "realized" && e.status !== "hypothetical");
  const month = monthOf(today);
  const monthStart = `${month}-01`;
  const monthEnd = horizonEndOfMonth(today);
  const chargesFlat = base.cards.flatMap((c) => c.charges.map((ch) => ({ ...ch })));
  const lines = spendingLines(base.entries, chargesFlat, monthStart, monthEnd);

  const catName = new Map(input.categories.map((c) => [c.id, c]));
  const topName = (id: string | null) => {
    if (!id) return "Sem categoria";
    let c = catName.get(id);
    while (c?.parentId && catName.get(c.parentId)) c = catName.get(c.parentId);
    return c?.name ?? "Sem categoria";
  };
  const cat = new Map<string, number>();
  for (const l of lines) cat.set(topName(l.categoryId), (cat.get(topName(l.categoryId)) ?? 0) + l.amount);

  const recent = [...base.entries]
    .filter((e: AccountEntry) => e.status === "confirmed" && e.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 8)
    .map((e) => ({ id: e.id, date: e.date, label: e.description ?? e.kind, amount: e.amount, kind: e.kind }));

  return {
    today,
    horizonEnd: to,
    hasData: base.accounts.length > 0 || base.cards.length > 0,
    hasDemo: input.accounts.some((a) => a.isDemo),
    totals: {
      bankBalance: timeline.startBalance,
      toReceive: sum(flows.filter((e) => e.amount > 0).map((e) => e.amount)),
      toPay: sum(flows.filter((e) => e.amount < 0).map((e) => -e.amount)),
      openInvoices: openInvoices as Cents,
      closedUnpaid: closedUnpaid as Cents,
      monthExpenses: sum(lines.map((l) => l.amount)),
      monthIncome: incomeTotal(base.entries, monthStart, monthEnd),
      projected: timeline.endBalance,
      free: free.freeToSpend,
      lowest: timeline.minBalance,
      lowestDate: timeline.minBalanceDate,
      firstNegativeDate: timeline.firstNegativeDate,
      reserve: input.reserve,
    },
    accounts,
    cards,
    upcoming: flows.slice(0, 8).map((e) => ({ date: e.date, label: e.label, amount: e.amount, status: e.status, originalDate: e.originalDate })),
    series: timeline.days.map((d) => ({ date: d.date, balance: d.closing / 100 })),
    recent,
    byCategory: [...cat.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount: amount as Cents })),
  };
}
