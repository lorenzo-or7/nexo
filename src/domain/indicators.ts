/**
 * Detalhamento dos indicadores da Visão geral. Tudo aqui sai da MESMA linha do tempo
 * que alimenta os números principais, então a composição sempre fecha com o indicador.
 */
import type { InvoiceLabel } from "./billing";
import type { LocalDate } from "./dates";
import type { Cents } from "./money";
import { sum } from "./money";
import type { TimelineEvent, TimelineResult, TimelineStatus } from "./timeline";

export interface DetailItem {
  id: string;
  date: LocalDate;
  originalDate?: LocalDate;
  label: string;
  amount: Cents;
  status: TimelineStatus;
  /** de onde vem: lançamento comum, renda fixa, conta fixa/assinatura ou fatura */
  origin: "entry" | "fixed_income" | "recurring" | "invoice";
  accountId?: string;
  /** tela do registro original */
  href: string;
}

export interface InvoiceDetail {
  cardId: string;
  cardName: string;
  ref: string;
  label: InvoiceLabel;
  closingDate: LocalDate;
  dueDate: LocalDate;
  total: Cents;
  paid: Cents;
  remaining: Cents;
}

export interface CompositionRow {
  key: string;
  label: string;
  amount: Cents;
  /** quantos lançamentos compõem a linha */
  count: number;
}

/** Como o "Livre para gastar" é montado, para um cenário. */
export interface Composition {
  startBalance: Cents;
  rows: CompositionRow[];
  endBalance: Cents;
  lowest: Cents;
  lowestDate: LocalDate;
  reserve: Cents;
  safetyMargin: Cents;
  free: Cents;
  /** saldo dia a dia (para ver a evolução e o dia do menor saldo) */
  series: { date: LocalDate; balance: Cents }[];
}

export function originOf(e: TimelineEvent): DetailItem["origin"] {
  if (e.source === "invoice") return "invoice";
  if (e.refId.startsWith("fi:")) return "fixed_income";
  if (e.refId.startsWith("sub:")) return "recurring";
  return "entry";
}

export function hrefOf(e: TimelineEvent): string {
  switch (originOf(e)) {
    case "invoice":
      return "/cartoes";
    case "fixed_income":
      return "/renda-fixa";
    case "recurring":
      return "/contas-fixas";
    default:
      return `/lancamentos?mes=${e.date.slice(0, 7)}${e.accountId ? `&conta=${e.accountId}` : ""}`;
  }
}

export function toDetailItem(e: TimelineEvent): DetailItem {
  return {
    id: `${e.source}:${e.refId}`,
    date: e.date,
    originalDate: e.originalDate,
    label: e.label,
    amount: e.amount,
    status: e.status,
    origin: originOf(e),
    accountId: e.accountId,
    href: hrefOf(e),
  };
}

export function compose(t: TimelineResult, opts: { reserve: Cents; safetyMargin: Cents }): Composition {
  const evs = t.events.filter((e) => e.status !== "realized");
  const buckets: { key: string; label: string; match: (e: TimelineEvent) => boolean }[] = [
    { key: "confirmed_in", label: "Entradas confirmadas", match: (e) => e.amount > 0 && e.kind !== "transfer" && e.status === "confirmed" },
    { key: "fixed_in", label: "Renda fixa prevista", match: (e) => e.amount > 0 && e.kind !== "transfer" && (e.status === "expected" || e.status === "late") && e.refId.startsWith("fi:") },
    { key: "expected_in", label: "Outras receitas previstas", match: (e) => e.amount > 0 && e.kind !== "transfer" && (e.status === "expected" || e.status === "late") && !e.refId.startsWith("fi:") },
    { key: "invoices", label: "Faturas de cartão", match: (e) => e.source === "invoice" },
    { key: "recurring", label: "Contas fixas e assinaturas", match: (e) => e.source === "entry" && e.amount < 0 && e.kind !== "transfer" && e.refId.startsWith("sub:") },
    { key: "other_out", label: "Outras despesas previstas", match: (e) => e.source === "entry" && e.amount < 0 && e.kind !== "transfer" && !e.refId.startsWith("sub:") },
    { key: "transfers", label: "Transferências (líquido)", match: (e) => e.kind === "transfer" },
    { key: "simulation", label: "Simulação", match: (e) => e.source === "simulation" },
  ];
  const used = new Set<TimelineEvent>();
  const rows: CompositionRow[] = [];
  for (const b of buckets) {
    const list = evs.filter((e) => !used.has(e) && b.match(e));
    list.forEach((e) => used.add(e));
    if (list.length) rows.push({ key: b.key, label: b.label, amount: sum(list.map((e) => e.amount)), count: list.length });
  }
  // qualquer coisa que não coube nas linhas acima entra como "Outros", para o total sempre fechar
  const rest = evs.filter((e) => !used.has(e));
  if (rest.length) rows.push({ key: "rest", label: "Outros", amount: sum(rest.map((e) => e.amount)), count: rest.length });
  const bottleneck = Math.min(t.minBalance, t.startBalance);
  return {
    startBalance: t.startBalance,
    rows,
    endBalance: t.endBalance,
    lowest: t.minBalance,
    lowestDate: t.minBalanceDate,
    reserve: opts.reserve,
    safetyMargin: opts.safetyMargin,
    free: (bottleneck - opts.reserve - opts.safetyMargin) as Cents,
    series: t.days.map((d) => ({ date: d.date, balance: d.closing as Cents })),
  };
}
