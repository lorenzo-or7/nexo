import Link from "next/link";
import { Pencil, Plus, Wallet } from "lucide-react";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { formatDateBR, type LocalDate } from "@/domain/dates";
import { sum } from "@/domain/money";
import type { AccountListItem } from "@/lib/data/accounts";
import { ACCOUNT_TYPES } from "@/domain/banks";
import { AccountEditor, AdjustBalanceDialog, RemoveAccountButton } from "./account-dialogs";

export function AccountsView({ accounts, today, monthEnd, openNew }: { accounts: AccountListItem[]; today: LocalDate; monthEnd: LocalDate; openNew?: boolean }) {
  const addButton = (
    <Button>
      <Plus />
      Nova conta
    </Button>
  );
  const total = sum(accounts.map((a) => a.balance));
  const totalProjected = sum(accounts.map((a) => a.projected));

  return (
    <>
      <PageHeader title="Contas" subtitle="Onde o seu dinheiro está, conta por conta." actions={<AccountEditor today={today} trigger={addButton} defaultOpen={openNew} />} />

      {accounts.length === 0 ? (
        <Panel className="grid max-w-xl justify-items-start gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Wallet className="size-6" /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Nenhuma conta ainda</h2>
            <p className="mt-1 text-ink-2">Cadastre suas contas bancárias e a carteira em dinheiro, com o saldo de hoje. Depois é só lançar o que entra e sai.</p>
          </div>
          <AccountEditor today={today} trigger={addButton} />
        </Panel>
      ) : (
        <>
          <Panel className="mb-6 flex flex-wrap items-end gap-x-12 gap-y-4">
            <div>
              <p className="text-sm text-ink-2">Total em contas hoje</p>
              <p className="mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.04em]"><Money value={total} /></p>
            </div>
            <div>
              <p className="text-sm text-ink-2">Previsto para {formatDateBR(monthEnd)}</p>
              <p className="mt-1 text-xl font-semibold"><Money value={totalProjected} /></p>
            </div>
          </Panel>

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-5">
            {accounts.map((a) => (
              <li key={a.id}>
                <Panel className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-semibold text-white" style={{ background: `linear-gradient(135deg, ${a.color}, color-mix(in oklab, ${a.color} 55%, black))` }}>
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{a.name}</h2>
                      <p className="truncate text-sm text-ink-3">
                        {[a.institutionName, ACCOUNT_TYPES.find((t) => t.key === a.type)?.label].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-ink-3">Saldo hoje</p>
                    <p className="text-[1.75rem] font-semibold tracking-[-0.03em]"><Money value={a.balance} /></p>
                    {a.openingDate > today && <p className="text-xs text-warning">Começa em {formatDateBR(a.openingDate)}</p>}
                  </div>
                  <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
                    <div>
                      <dt className="text-ink-3">Fim do mês</dt>
                      <dd className="font-medium"><Money value={a.projected} /></dd>
                    </div>
                    <div>
                      <dt className="text-ink-3">Pendentes</dt>
                      <dd className="font-medium">
                        {a.pending > 0 ? (
                          <Link href={`/lancamentos?conta=${a.id}&tipo=pending`} className="text-accent underline-offset-4 hover:underline">{a.pending} {a.pending === 1 ? "lançamento" : "lançamentos"}</Link>
                        ) : "Nenhum"}
                      </dd>
                    </div>
                    {a.paysCards.length > 0 && (
                      <div className="col-span-2">
                        <dt className="text-ink-3">Paga as faturas de</dt>
                        <dd className="truncate font-medium">{a.paysCards.join(", ")}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="-mx-1 mt-auto flex flex-wrap gap-1">
                    <Button asChild variant="ghost" size="sm"><Link href={`/lancamentos?conta=${a.id}`}>Ver extrato</Link></Button>
                    <AdjustBalanceDialog id={a.id} name={a.name} balance={a.balance} />
                    <AccountEditor account={a} today={today} trigger={<Button variant="ghost" size="sm"><Pencil />Editar</Button>} />
                    <RemoveAccountButton id={a.id} name={a.name} />
                  </div>
                </Panel>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
