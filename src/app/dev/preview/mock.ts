import type { Cents } from "@/domain/money";
import type { AccountListItem } from "@/lib/data/accounts";
import type { EntryRow, QuickEntryData } from "@/lib/data/ledger";
import type { SubscriptionRow } from "@/lib/data/subscriptions";

/** Dados fictícios SOMENTE para a prévia de desenvolvimento (NEXO_DEV_PREVIEW=1). */
export const TODAY = "2026-10-09";
const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000a2";
const CAT = { mercado: "00000000-0000-4000-8000-0000000000c1", geral: "00000000-0000-4000-8000-0000000000c0", uber: "00000000-0000-4000-8000-0000000000c3", transporte: "00000000-0000-4000-8000-0000000000c2", receitas: "00000000-0000-4000-8000-0000000000c4", salario: "00000000-0000-4000-8000-0000000000c5" };

export const quickEntry: QuickEntryData = {
  today: TODAY,
  accounts: [
    { id: A, name: "Nubank", institution: "Nubank", color: "#820AD1", openingDate: "2026-10-01" },
    { id: B, name: "Santander", institution: "Santander", color: "#EC0000", openingDate: "2026-10-01" },
  ],
  categories: [
    { id: CAT.geral, name: "Despesas gerais", parentId: null, kind: "expense" },
    { id: CAT.mercado, name: "Mercado", parentId: CAT.geral, kind: "expense" },
    { id: CAT.transporte, name: "Transporte", parentId: null, kind: "expense" },
    { id: CAT.uber, name: "Uber e aplicativos", parentId: CAT.transporte, kind: "expense" },
    { id: CAT.receitas, name: "Receitas", parentId: null, kind: "income" },
    { id: CAT.salario, name: "Salário", parentId: CAT.receitas, kind: "income" },
  ],
  people: ["Ana", "Bruno"],
  cards: [
    { id: "00000000-0000-4000-8000-0000000000d1", name: "Nubank Ultravioleta", institution: "Nubank", color: "#820AD1", closingDay: 13, dueDay: 20, closingToDueMonths: null, closingDayRule: "next_invoice", overrides: {}, paymentAccountId: A },
  ],
};

const base = { version: 1, paymentMethod: null, notes: null, tags: [] as string[], transfer: null, cardId: null, invoiceRef: null };
export const entries: EntryRow[] = [
  { ...base, id: "00000000-0000-4000-8000-0000000000e9", date: "2026-10-09", kind: "expense", status: "confirmed", amount: -30000 as Cents, description: "Booster box", accountId: "", categoryId: CAT.geral, paymentMethod: "credit", cardId: "00000000-0000-4000-8000-0000000000d1", invoiceRef: "2026-10", purchase: { installments: 3, firstInvoiceRef: "2026-10", status: "active" }, reimbursements: [{ counterparty: "Ana", amount: 15000 as Cents, received: false }] },
  { ...base, id: "00000000-0000-4000-8000-0000000000e8", date: "2026-10-20", kind: "refund", status: "scheduled", amount: 15000 as Cents, description: "Reembolso: Booster box", accountId: A, categoryId: CAT.geral, counterparty: "Ana" },
  { ...base, id: "e1", date: "2026-10-19", kind: "income", status: "expected", amount: 48899 as Cents, description: "Freela site", accountId: A, categoryId: CAT.receitas },
  { ...base, id: "e2", date: "2026-10-09", kind: "expense", status: "confirmed", amount: -8790 as Cents, description: "Mercado do mês", accountId: A, categoryId: CAT.mercado, tags: ["casa"], paymentMethod: "debit" },
  { ...base, id: "e3", date: "2026-10-09", kind: "expense", status: "confirmed", amount: -2350 as Cents, description: null, accountId: A, categoryId: CAT.uber },
  { ...base, id: "e4", date: "2026-10-08", kind: "transfer", status: "confirmed", amount: -10000 as Cents, description: "Reserva", accountId: A, categoryId: null, transfer: { id: "t1", fromId: A, toId: B, amount: 10000 as Cents } },
  { ...base, id: "e5", date: "2026-10-05", kind: "income", status: "confirmed", amount: 81268 as Cents, description: "Salário", accountId: A, categoryId: CAT.salario },
  { ...base, id: "e6", date: "2026-10-03", kind: "expense", status: "scheduled", amount: -12000 as Cents, description: "Conta de luz", accountId: B, categoryId: CAT.geral },
];

export const accounts: AccountListItem[] = [
  { id: A, name: "Nubank", institutionKey: "nubank", institutionName: "Nubank", type: "digital", color: "#820AD1", openingBalance: 32112 as Cents, openingDate: "2026-10-01", balance: 70240 as Cents, projected: 37651 as Cents, pending: 1, paysCards: ["Nubank Ultravioleta"] },
  { id: B, name: "Santander", institutionKey: "santander", institutionName: "Santander", type: "checking", color: "#EC0000", openingBalance: 0 as Cents, openingDate: "2026-10-01", balance: 10000 as Cents, projected: -2000 as Cents, pending: 1, paysCards: [] },
  { id: "00000000-0000-4000-8000-0000000000a3", name: "Carteira", institutionKey: "outro", institutionName: null, type: "cash", color: "#0E7A38", openingBalance: 5000 as Cents, openingDate: "2026-10-01", balance: 5000 as Cents, projected: 5000 as Cents, pending: 0, paysCards: [] },
];

/** Assinaturas fictícias da prévia. */
export function subscriptionRows(): SubscriptionRow[] {
  const row = (id: string, name: string, amount: number, start: string, over: Partial<Omit<SubscriptionRow, "sub">> & { sub?: Partial<SubscriptionRow["sub"]> } = {}): SubscriptionRow => {
    const { sub, ...rest } = over;
    return {
      sub: { id, name, rule: { frequency: "monthly", interval: 1, startDate: start }, prices: [{ effectiveFrom: start, amount: amount as Cents }], status: "active", ...sub },
      payWith: "card",
      cardId: "00000000-0000-4000-8000-0000000000d1",
      accountId: null,
      categoryId: null,
      color: null,
      renewalAlertDays: 3,
      chargedThrough: "2026-10-09",
      keys: new Set(),
      charges: [],
      ...rest,
    };
  };
  return [
    row("00000000-0000-4000-8000-0000000000f1", "Netflix", 4490, "2026-08-11", { charges: [{ periodKey: "2026-08", dueOn: "2026-08-11", amount: 4490 as Cents }, { periodKey: "2026-09", dueOn: "2026-09-11", amount: 4490 as Cents }], keys: new Set(["2026-08", "2026-09"]) }),
    row("00000000-0000-4000-8000-0000000000f2", "Spotify", 2190, "2026-07-25", { payWith: "account", cardId: null, accountId: "00000000-0000-4000-8000-0000000000a1", color: "#2F9E44" }),
    row("00000000-0000-4000-8000-0000000000f3", "ChatGPT Plus", 11000, "2026-09-20"),
    row("00000000-0000-4000-8000-0000000000f4", "Domínio do site", 6000, "2026-03-02", { sub: { rule: { frequency: "yearly", interval: 1, startDate: "2026-03-02" } } }),
    row("00000000-0000-4000-8000-0000000000f5", "Academia", 9990, "2026-05-05", { sub: { status: "paused", pausedFrom: "2026-09-01" } }),
    row("00000000-0000-4000-8000-0000000000f6", "Globoplay", 2290, "2026-01-10", { sub: { status: "cancelled", cancelledAt: "2026-06-30" } }),
  ];
}
