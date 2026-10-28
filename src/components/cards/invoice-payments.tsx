"use client";
import { Undo2, Wallet } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";
import { payInvoice, reverseInvoicePayment, type CardActionResult } from "@/app/(app)/cartoes/actions";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Picker } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { formatDateBR, formatMonthBR, type LocalDate } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";
import type { CardInvoiceItem } from "@/lib/data/cards";
import { cn } from "@/lib/cn";

const TONE: Record<string, string> = {
  Paga: "bg-positive-soft text-positive",
  Vencida: "bg-accent-soft text-negative",
  "Parcialmente paga": "bg-surface-2 text-ink",
};

export function InvoiceBadge({ label }: { label: string }) {
  return <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", TONE[label] ?? "bg-surface-2 text-ink-2")}>{label}</span>;
}

function PayDialog({
  cardId, cardName, invoice, accounts, defaultAccountId, today,
}: {
  cardId: string; cardName: string; invoice: CardInvoiceItem; accounts: { id: string; name: string }[]; defaultAccountId: string | null; today: LocalDate;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<CardActionResult, FormData>(payInvoice, undefined);
  const [amount, setAmount] = useState(formatBRL(invoice.payable));
  const toast = useToast();
  const id = useId();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      setOpen(false);
      setKey(crypto.randomUUID()); // próximo pagamento = nova chave
    }
  }, [state, toast]);
  useEffect(() => {
    if (open) setAmount(formatBRL(invoice.payable));
  }, [open, invoice.payable]);
  const first = accounts.find((a) => a.id === defaultAccountId)?.id ?? accounts[0]?.id ?? "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="accent"><Wallet />Registrar pagamento</Button>
      </DialogTrigger>
      <DialogContent title="Registrar pagamento" description={`${cardName} · fatura de ${formatMonthBR(invoice.ref)}`} className="[--dialog-w:480px]">
        <form action={action} className="grid gap-4 overflow-y-auto p-5 sm:p-6">
          <input type="hidden" name="card_id" value={cardId} />
          <input type="hidden" name="invoice_ref" value={invoice.ref} />
          <input type="hidden" name="key" value={key} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
            <div><dt className="text-ink-3">Valor da fatura</dt><dd className="font-medium"><Money value={invoice.total} /></dd></div>
            <div><dt className="text-ink-3">Já pago</dt><dd className="font-medium"><Money value={invoice.paid} /></dd></div>
            <div><dt className="text-ink-3">Falta pagar</dt><dd className="font-semibold"><Money value={invoice.remaining} /></dd></div>
          </dl>
          {invoice.scheduled > 0 && (
            <p className="text-sm text-ink-2" data-testid="scheduled-note">
              Já há <Money value={invoice.scheduled} /> agendado para esta fatura. Você ainda pode lançar até <Money value={invoice.payable} />.
            </p>
          )}
          <Field label="Valor a pagar" htmlFor={`${id}-amount`} error={state && !state.ok && state.field === "amount" ? state.error : undefined}
            hint={<button type="button" className="text-sm text-accent underline-offset-2 hover:underline" onClick={() => setAmount(formatBRL(invoice.payable))}>Pagar tudo</button>}>
            <MoneyInput id={`${id}-amount`} name="amount" value={amount} onValueChange={setAmount} required />
          </Field>
          <Field label="Conta usada" htmlFor={`${id}-acc`}>
            <Picker id={`${id}-acc`} name="account_id" defaultValue={first} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </Field>
          <Field label="Data do pagamento" htmlFor={`${id}-date`}>
            <DatePicker id={`${id}-date`} name="date" defaultValue={today} today={today} />
          </Field>
          <p className="text-sm text-ink-3">O pagamento reduz o saldo da conta e o que falta na fatura. Ele não conta como uma nova despesa.</p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="accent" loading={pending} disabled={accounts.length === 0}>Registrar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReverseButton({ id, amount }: { id: string; amount: Cents }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CardActionResult, FormData>(reverseInvoicePayment, undefined);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      setOpen(false);
    }
  }, [state, toast]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" aria-label={`Estornar pagamento de ${formatBRL(amount)}`}><Undo2 />Estornar</Button>
      </DialogTrigger>
      <DialogContent title="Estornar este pagamento?" className="[--dialog-w:440px]">
        <form action={action} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            Os <strong className="font-semibold text-ink">{formatBRL(amount)}</strong> voltam para a conta e para o que falta na fatura. O estorno fica registrado no histórico e só pode ser feito uma vez.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="accent" loading={pending}>Estornar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Faturas do cartão: estado, valores e pagamentos já feitos (com estorno). */
export function InvoiceList({
  cardId, cardName, invoices, accounts, defaultAccountId, today,
}: {
  cardId: string; cardName: string; invoices: CardInvoiceItem[]; accounts: { id: string; name: string }[]; defaultAccountId: string | null; today: LocalDate;
}) {
  if (invoices.length === 0) return null;
  return (
    <ul className="grid gap-3 border-t border-border pt-4" aria-label={`Faturas de ${cardName}`}>
      {invoices.map((i) => (
        <li key={i.ref} className="grid gap-2 rounded-2xl border border-border p-3" data-testid="invoice-row">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium capitalize">{formatMonthBR(i.ref)}</span>
              <InvoiceBadge label={i.label} />
            </div>
            <span className="text-sm text-ink-3">vence {formatDateBR(i.dueDate)}</span>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-ink-3">Fatura</dt><dd><Money value={i.total} /></dd></div>
            <div><dt className="text-ink-3">Pago</dt><dd><Money value={i.paid} /></dd></div>
            <div><dt className="text-ink-3">Falta</dt><dd className="font-semibold"><Money value={i.remaining} /></dd></div>
          </dl>
          {i.payments.length > 0 && (
            <ul className="grid gap-1 text-sm text-ink-2">
              {i.payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{formatDateBR(p.date)} · {p.accountName} · <Money value={p.amount} />{p.scheduled && " · agendado"}</span>
                  <ReverseButton id={p.id} amount={p.amount} />
                </li>
              ))}
            </ul>
          )}
          {i.remaining > 0 && i.payable <= 0 && (
            <p className="text-sm text-ink-2" data-testid="fully-scheduled">Falta pagar coberto por pagamento agendado.</p>
          )}
          {i.payable > 0 && (
            <div className="flex justify-end">
              <PayDialog cardId={cardId} cardName={cardName} invoice={i} accounts={accounts} defaultAccountId={defaultAccountId} today={today} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
