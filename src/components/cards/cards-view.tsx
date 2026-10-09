import { CalendarClock, CreditCard, Pencil, Plus } from "lucide-react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { formatDateBR, formatMonthBR } from "@/domain/dates";
import type { CardListItem } from "@/lib/data/cards";
import { BankCardFace } from "./bank-card-face";
import { CardEditor } from "./card-editor";
import { RemoveCardButton } from "./remove-card";

const STATUS: Record<string, string> = {
  open: "Fatura aberta",
  closed: "Fatura fechada",
  overdue: "Fatura vencida",
};

export function CardsView({ cards, accounts, openNew }: { cards: CardListItem[]; accounts: { id: string; name: string }[]; openNew?: boolean }) {
  const addButton = (
    <Button>
      <Plus />
      Adicionar cartão
    </Button>
  );
  return (
    <>
      <PageHeader title="Cartões" subtitle="Faturas, limites e datas de cada cartão." actions={<CardEditor accounts={accounts} trigger={addButton} defaultOpen={openNew} />} />

      {cards.length === 0 ? (
        <Panel className="grid max-w-xl justify-items-start gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><CreditCard className="size-6" /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Nenhum cartão ainda</h2>
            <p className="mt-1 text-ink-2">Adicione seus cartões com o dia de fechamento e de vencimento. O NEXO coloca cada compra na fatura certa e só tira dinheiro da conta quando a fatura é paga.</p>
          </div>
          <CardEditor accounts={accounts} trigger={addButton} />
        </Panel>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-5">
          {cards.map((c) => {
            const pct = c.limit > 0 ? Math.min(100, Math.max(0, Math.round((c.used / c.limit) * 100))) : 0;
            return (
              <li key={c.id}>
                <Panel className="grid h-full gap-5 p-4 sm:p-5">
                  <BankCardFace card={{ ...c }} />
                  <div className="grid gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm text-ink-3">{c.invoice ? `${STATUS[c.invoice.status] ?? "Fatura"} de ${formatMonthBR(c.invoice.ref)}` : "Sem fatura a pagar"}</p>
                        <p className="mt-0.5 text-[1.5rem] font-semibold tracking-[-0.03em]"><Money value={c.invoice?.remaining ?? 0} /></p>
                      </div>
                      {c.invoice && (
                        <p className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm text-ink-2">
                          <CalendarClock className="size-4" />
                          {formatDateBR(c.invoice.dueDate)}
                        </p>
                      )}
                    </div>

                    {c.limit > 0 && (
                      <div className="grid gap-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-ink-2">Limite disponível</span>
                          <span className="font-medium"><Money value={c.available} /> <span className="font-normal text-ink-3">de <Money value={c.limit} /></span></span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Limite usado">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}

                    <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
                      <div><dt className="text-ink-3">Fecha</dt><dd className="font-medium">dia {c.closingDay}</dd></div>
                      <div><dt className="text-ink-3">Vence</dt><dd className="font-medium">dia {c.dueDay}</dd></div>
                      <div className="min-w-0"><dt className="text-ink-3">Paga com</dt><dd className="truncate font-medium">{c.paymentAccountName ?? "—"}</dd></div>
                    </dl>

                    <div className="-mx-1 flex flex-wrap gap-1">
                      <CardEditor
                        card={c}
                        accounts={accounts}
                        trigger={<Button variant="ghost" size="sm"><Pencil />Editar</Button>}
                      />
                      <RemoveCardButton id={c.id} name={c.name} />
                    </div>
                  </div>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
