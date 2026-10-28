import { describe, expect, it } from "vitest";
import { buildInstallments, type CardBillingConfig, type CardCharge } from "../billing";
import { categoryBreakdown } from "../categories";
import { consumptionFor } from "../consumption";
import { spendingLines, type AccountEntry } from "../ledger";
import type { Cents } from "../money";

const cats = [
  { id: "alim", name: "Alimentação", parentId: null },
  { id: "merc", name: "Mercado", parentId: "alim" },
  { id: "rest", name: "Restaurante", parentId: "alim" },
  { id: "transp", name: "Transporte", parentId: null },
];
const card: CardBillingConfig = { closingDay: 5, dueDay: 12 };
const FROM = "2026-10-01";
const TO = "2026-10-31";

const e = (id: string, kind: AccountEntry["kind"], amount: number, categoryId: string | null, over: Partial<AccountEntry> = {}): AccountEntry => ({
  id, accountId: "acc", date: "2026-10-05", amount: amount as Cents, kind, status: "confirmed", categoryId, ...over,
});

function scenario() {
  const entries: AccountEntry[] = [
    e("a", "expense", -10000, "merc"),
    e("b", "expense", -5000, "alim"), // direto na principal
    e("c", "expense", -3000, null),
    e("d", "expense", -9999, "merc", { status: "expected" }), // ainda não aconteceu
    e("f", "refund", 2000, "merc"), // reembolso recebido
    e("g", "transfer", -7000, null), // transferência nunca é consumo
    e("h", "invoice_payment", -30000, null),
  ];
  // compra de 300 em 3x, restaurante: parcelas 2 e 3 canceladas por estorno + crédito de 40 feito em outubro
  const inst = buildInstallments(card, { purchaseId: "p1", cardId: "k1", date: "2026-10-03", total: 30000 as Cents, installments: 3 });
  const charges: (CardCharge & { categoryId?: string | null })[] = [
    { ...inst[0], categoryId: "rest" },
    { ...inst[1], categoryId: "rest", cancelled: true },
    { ...inst[2], categoryId: "rest", cancelled: true },
    { id: "r1", cardId: "k1", purchaseId: "p1", invoiceRef: "2026-11", amount: -4000 as Cents, date: "2026-10-20", kind: "refund", categoryId: "rest" },
    { id: "t1", cardId: "k1", invoiceRef: "2026-11", amount: 1500 as Cents, date: "2026-10-21", kind: "fee", categoryId: null },
    // assinatura futura no cartão: só previsão, não é consumo realizado
    { id: "sub:1", cardId: "k1", invoiceRef: "2026-11", amount: 5000 as Cents, date: "2026-10-28", kind: "installment", projected: true, categoryId: "transp" },
  ];
  return spendingLines(entries, charges, FROM, TO);
}

describe("consumo: gráfico de categorias e Lançamentos usam a mesma conta", () => {
  const lines = scenario();

  it("parcelas canceladas, estornos, reembolsos, tarifas e previsões", () => {
    const all = consumptionFor(lines, cats);
    expect(all.parts.expense).toBe(10000 + 5000 + 3000);
    expect(all.parts.installment).toBe(10000); // só a parcela ativa; 2 e 3 canceladas
    expect(all.parts.card_refund).toBe(-4000);
    expect(all.parts.account_refund).toBe(-2000);
    expect(all.parts.fee).toBe(1500);
    // pendente (9.999), transferência, pagamento de fatura e assinatura projetada ficam de fora
    expect(all.total).toBe(18000 + 10000 - 4000 - 2000 + 1500);
    expect(all.total).toBe(
      all.parts.expense + all.parts.installment + all.parts.fee + all.parts.card_refund + all.parts.account_refund,
    );
  });

  it("cada fatia do gráfico (principal, subcategoria, 'Sem subcategoria', 'Sem categoria') bate com o filtro de Lançamentos", () => {
    const tree = categoryBreakdown(lines, cats);
    const grand = consumptionFor(lines, cats).total;
    expect(tree.reduce((t, c) => t + c.amount, 0)).toBe(grand);
    for (const top of tree) {
      const f = top.id === null ? { categoryId: "none" } : { categoryId: top.id };
      expect(consumptionFor(lines, cats, f).total, `principal ${top.name}`).toBe(top.amount);
      for (const sub of top.subs) {
        const sf = top.id === null ? { categoryId: "none" } : sub.id === null ? { categoryId: top.id, onlyParent: true } : { categoryId: sub.id };
        expect(consumptionFor(lines, cats, sf).total, `${top.name} › ${sub.name}`).toBe(sub.amount);
      }
    }
  });

  it("categoria apagada conta como 'Sem categoria' nos dois lados", () => {
    const orphan = spendingLines([e("x", "expense", -1234, "sumiu")], [], FROM, TO);
    const tree = categoryBreakdown(orphan, cats);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBeNull();
    expect(consumptionFor(orphan, cats, { categoryId: "none" }).total).toBe(1234);
  });
});
