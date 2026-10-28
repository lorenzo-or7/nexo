/**
 * Consumo de um período filtrado — a MESMA conta do gráfico de categorias e da tela de Lançamentos.
 *
 * Os dois lados partem das mesmas linhas (`spendingLines`) e do mesmo critério de categoria
 * (`categoryFilterIds`), então o número de uma fatia do gráfico e o "Consumo" mostrado em Lançamentos
 * com o mesmo mês/categoria são, por construção, o mesmo número. A conta aberta:
 *
 *   consumo = despesas em conta + parcelas ativas no cartão + tarifas − estornos no cartão − reembolsos
 *
 * Compras parceladas entram pelo valor das parcelas ATIVAS na data da compra (parcelas canceladas
 * por estorno não contam); um estorno reduz o consumo na data em que foi feito.
 */
import { categoryFilterIds } from "./categories";
import type { SpendingLine, SpendingPart } from "./ledger";
import type { Cents } from "./money";

export interface ConsumptionFilter {
  /** id da categoria, "none" (sem categoria) ou ausente (todas) */
  categoryId?: string;
  /** com categoria principal: só o que foi lançado direto nela */
  onlyParent?: boolean;
}

export interface ConsumptionSummary {
  total: Cents;
  /** cada parte com sinal de consumo: estornos e reembolsos vêm negativos */
  parts: Record<SpendingPart, Cents>;
}

export function consumptionFor(
  lines: readonly SpendingLine[],
  categories: readonly { id: string; parentId: string | null; name?: string; kind?: "expense" | "income" }[],
  f: ConsumptionFilter = {},
): ConsumptionSummary {
  const known = new Set(categories.map((c) => c.id));
  let pick: (id: string | null) => boolean = () => true;
  if (f.categoryId === "none") {
    // sem categoria, ou categoria que não existe mais — igual ao "Sem categoria" do gráfico
    pick = (id) => id === null || !known.has(id);
  } else if (f.categoryId) {
    const nodes = categories.map((c) => ({ id: c.id, name: c.name ?? "", parentId: c.parentId, kind: c.kind ?? ("expense" as const) }));
    const ids = new Set(f.onlyParent ? [f.categoryId] : categoryFilterIds(f.categoryId, nodes));
    pick = (id) => id !== null && ids.has(id);
  }
  const parts: Record<SpendingPart, number> = { expense: 0, installment: 0, fee: 0, card_refund: 0, account_refund: 0 };
  for (const l of lines) if (pick(l.categoryId)) parts[l.part] += l.amount;
  const total = parts.expense + parts.installment + parts.fee + parts.card_refund + parts.account_refund;
  return { total: total as Cents, parts: parts as Record<SpendingPart, Cents> };
}
