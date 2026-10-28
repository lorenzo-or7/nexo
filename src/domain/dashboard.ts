/**
 * Monta o modelo da tela inicial a partir dos dados reais (já carregados do banco).
 * Função pura e serializável: tudo que aparece no dashboard é derivado daqui.
 */
import { computeInvoices } from "./billing";
import { categoryColor } from "./categories";
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
  color?: string | null;
}

export interface ChartDay {
  date: LocalDate;
  /** saldo projetado contando as receitas previstas */
  balanceAll: number;
  /** saldo projetado só com o que é certo (sem receitas previstas) */
  balanceConfirmed: number;
  incomeConfirmed: number;
  incomeExpected: number;
  expenses: number;
  /** saídas do dia por origem (somam `expenses`) */
  outInvoices: number;
  outRecurring: number;
  outOther: number;
  /** o que acontece no dia (para o tooltip) */
  items: { label: string; amount: number }[];
}

export interface ExpectedIncomeItem {
  date: LocalDate;
  label: string;
  amount: Cents;
  late: boolean;
}

/** Os números do destaque para um cenário (só o confirmado, ou contando as receitas previstas). */
export interface ForecastScenario {
  projected: Cents;
  free: Cents;
  lowest: Cents;
  lowestDate: LocalDate;
  firstNegativeDate: LocalDate | null;
  /** quanto desse cenário vem de receitas apenas previstas (não confirmadas) */
  expectedIncome: Cents;
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
    /** fatura ainda aberta (não fechada) de cada cartão; parcelas futuras ficam em `futureInvoices` */
    openInvoices: Cents;
    futureInvoices: Cents;
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
  byCategory: { name: string; amount: Cents; color: string }[];
  /** destaque nos dois cenários: o usuário alterna na tela */
  scenarios: { confirmed: ForecastScenario; withExpected: ForecastScenario };
  /** dados dos gráficos (valores em reais, só para desenhar) */
  chart: { days: ChartDay[]; expectedIncome: ExpectedIncomeItem[]; defaultShowExpected: boolean };
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
  // duas projeções para o gráfico: com e sem as receitas previstas (o filtro da tela alterna entre elas)
  const withExpected = buildTimeline({ ...base, to, includeExpectedIncome: true });
  const confirmedOnly = buildTimeline({ ...base, to, includeExpectedIncome: false });
  const chartDays: ChartDay[] = withExpected.days.map((d, i) => {
    const isExpected = (e: { status: TimelineStatus }) => e.status === "expected" || e.status === "late";
    const pos = d.events.filter((e) => e.amount > 0 && e.status !== "realized");
    const outs = d.events.filter((e) => e.amount < 0 && e.status !== "realized");
    const outOf = (f: (e: (typeof outs)[number]) => boolean) => sum(outs.filter(f).map((e) => -e.amount)) / 100;
    const isInvoice = (e: (typeof outs)[number]) => e.source === "invoice";
    // contas fixas e assinaturas pagas em conta entram no extrato com este prefixo
    const isRecurring = (e: (typeof outs)[number]) => e.source === "entry" && e.refId.startsWith("sub:");
    return {
      date: d.date,
      balanceAll: d.closing / 100,
      balanceConfirmed: confirmedOnly.days[i].closing / 100,
      incomeConfirmed: sum(pos.filter((e) => !isExpected(e)).map((e) => e.amount)) / 100,
      incomeExpected: sum(pos.filter(isExpected).map((e) => e.amount)) / 100,
      expenses: d.outflow / 100,
      outInvoices: outOf(isInvoice),
      outRecurring: outOf(isRecurring),
      outOther: outOf((e) => !isInvoice(e) && !isRecurring(e)),
      items: d.events.filter((e) => e.status !== "realized").slice(0, 5).map((e) => ({ label: e.label, amount: e.amount / 100 })),
    };
  });
  const expectedIncome: ExpectedIncomeItem[] = withExpected.events
    .filter((e) => e.amount > 0 && (e.status === "expected" || e.status === "late"))
    .map((e) => ({ date: e.date, label: e.label, amount: e.amount, late: e.status === "late" }));

  const free = freeToSpend(timeline, { reserve: input.reserve, safetyMargin: input.safetyMargin });
  const scenarioOf = (t: typeof timeline, expectedIncome: Cents): ForecastScenario => {
    const f = freeToSpend(t, { reserve: input.reserve, safetyMargin: input.safetyMargin });
    return { projected: t.endBalance, free: f.freeToSpend, lowest: t.minBalance, lowestDate: t.minBalanceDate, firstNegativeDate: t.firstNegativeDate, expectedIncome };
  };
  const expectedTotal = sum(expectedIncome.map((e) => e.amount)) as Cents;

  const accounts = input.accounts.map((a) => {
    const acc = base.accounts.find((x) => x.id === a.id)!;
    return { ...a, balance: acc.openingDate <= today ? accountBalance(acc, base.entries, today) : acc.openingBalance };
  });

  let openInvoices = 0;
  let futureInvoices = 0;
  let closedUnpaid = 0;
  const cards = input.cards.map((meta) => {
    const c = base.cards.find((x) => x.id === meta.id)!;
    const invoices = computeInvoices(c.config, c.charges, c.payments, today);
    let current: (typeof invoices)[number] | undefined;
    let openSeen = false;
    for (const inv of invoices) {
      if (inv.status === "open") {
        if (!openSeen) {
          openInvoices += inv.remaining;
          openSeen = true;
        } else futureInvoices += inv.remaining;
      }
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
  // "A receber"/"A pagar" não dependem do ajuste de receitas previstas e ignoram transferências
  // (os dois lados se anulam) — fonte única para o card e para o detalhamento.
  const payables = withExpected.events.filter(
    (e) => e.status !== "realized" && e.status !== "hypothetical" && e.kind !== "transfer",
  );
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
  const topNode = (id: string | null) => {
    let c = id ? catName.get(id) : undefined;
    while (c?.parentId && catName.get(c.parentId)) c = catName.get(c.parentId);
    return c;
  };
  const cat = new Map<string, number>();
  const catColor = new Map<string, string>();
  for (const l of lines) {
    const name = topName(l.categoryId);
    cat.set(name, (cat.get(name) ?? 0) + l.amount);
    if (!catColor.has(name)) {
      const node = topNode(l.categoryId);
      catColor.set(name, categoryColor({ id: node?.id ?? name, name, parentId: null, kind: "expense", color: node?.color ?? null }, []));
    }
  }

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
      toReceive: sum(payables.filter((e) => e.amount > 0).map((e) => e.amount)),
      toPay: sum(payables.filter((e) => e.amount < 0).map((e) => -e.amount)),
      openInvoices: openInvoices as Cents,
      futureInvoices: futureInvoices as Cents,
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
      .map(([name, amount]) => ({ name, amount: amount as Cents, color: catColor.get(name)! })),
    scenarios: { confirmed: scenarioOf(confirmedOnly, 0 as Cents), withExpected: scenarioOf(withExpected, expectedTotal) },
    chart: { days: chartDays, expectedIncome, defaultShowExpected: base.includeExpectedIncome },
  };
}
