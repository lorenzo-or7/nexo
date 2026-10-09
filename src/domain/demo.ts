/**
 * Cenário demonstrativo (seção 18). Usado pelos testes e pela opção
 * "Carregar dados de demonstração", que grava num espaço separado e
 * marcado como demo (`is_demo = true`), nunca misturado aos dados reais.
 * A conta que recebe o saldo inicial é escolhida pelo usuário.
 */
import type { TimelineInput } from "./timeline";
import type { Cents } from "./money";

export function demoScenario(opts: { balanceAccountName: string; today?: string }): TimelineInput {
  const today = opts.today ?? "2026-10-08";
  return {
    today,
    to: "2026-10-31",
    includeExpectedIncome: true,
    accounts: [{ id: "acc-main", name: opts.balanceAccountName, openingBalance: 32112 as Cents, openingDate: today }],
    entries: [
      { id: "inc-1", accountId: "acc-main", date: "2026-10-09", amount: 81268 as Cents, kind: "income", status: "expected", description: "Recebimento previsto" },
      { id: "inc-2", accountId: "acc-main", date: "2026-10-19", amount: 48899 as Cents, kind: "income", status: "expected", description: "Recebimento previsto" },
    ],
    cards: [
      {
        id: "card-santander",
        name: "Santander",
        config: { closingDay: 3, dueDay: 10 },
        paymentAccountId: "acc-main",
        charges: [{ id: "s-open", cardId: "card-santander", invoiceRef: "2026-10", amount: 54468 as Cents, date: "2026-10-01", kind: "adjustment" }],
        payments: [],
      },
      {
        id: "card-nubank",
        name: "Nubank",
        config: { closingDay: 13, dueDay: 20 },
        paymentAccountId: "acc-main",
        charges: [{ id: "n-open", cardId: "card-nubank", invoiceRef: "2026-10", amount: 81488 as Cents, date: "2026-10-01", kind: "adjustment" }],
        payments: [],
      },
    ],
  };
}
