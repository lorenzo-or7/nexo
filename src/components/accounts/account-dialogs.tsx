"use client";
import { Scale, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { adjustBalance, removeAccount, saveAccount, type AccountActionResult } from "@/app/(app)/contas/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { ACCOUNT_TYPES, BANKS, bankByKey } from "@/domain/banks";
import type { LocalDate } from "@/domain/dates";
import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";


export interface EditableAccount {
  id: string;
  name: string;
  institutionKey: string | null;
  type: string;
  color: string;
  openingBalance: Cents;
  openingDate: LocalDate;
}

function useDone(state: AccountActionResult, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

const asInput = (c: number) => (c === 0 ? "" : (c < 0 ? "-" : "") + formatBRL(Math.abs(c) as Cents).replace("R$ ", ""));

export function AccountEditor({ account, today, trigger, defaultOpen }: { account?: EditableAccount; today: LocalDate; trigger: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={account ? "Editar conta" : "Nova conta"} description="Contas bancárias, carteira em dinheiro ou qualquer lugar onde seu dinheiro fica." className="[--dialog-w:560px]">
        {open && <AccountForm account={account} today={today} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({ account, today, onDone }: { account?: EditableAccount; today: LocalDate; onDone: () => void }) {
  const [state, action, pending] = useActionState<AccountActionResult, FormData>(saveAccount, undefined);
  useDone(state, onDone);
  const [institution, setInstitution] = useState(account?.institutionKey ?? "nubank");
  const [color, setColor] = useState(account?.color ?? bankByKey("nubank").color);
  const [name, setName] = useState(account?.name ?? "");
  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);
  const preset = bankByKey(institution);
  return (
    <form action={action} className="grid gap-5 p-5 sm:p-6">
      {account && <input type="hidden" name="id" value={account.id} />}
      <input type="hidden" name="color" value={color} />
      {state && !state.ok && !state.field && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Instituição" htmlFor="institution_key">
          <Picker
            id="institution_key"
            name="institution_key"
            value={institution}
            onValueChange={(v) => {
              setInstitution(v);
              setColor(bankByKey(v).color);
              if (!name || BANKS.some((b) => b.name === name)) setName(v === "outro" ? "" : bankByKey(v).name);
            }}
            options={BANKS.map((b) => ({ value: b.key, label: b.key === "outro" ? "Outra / Carteira" : b.name, color: b.color }))}
          />
        </Field>
        <Field label="Nome da conta" htmlFor="name" error={errorFor("name")}>
          <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder={preset.key === "outro" ? "Ex.: Carteira" : preset.name} />
        </Field>
        <Field label="Tipo" htmlFor="account_type">
          <Picker id="account_type" name="account_type" defaultValue={account?.type ?? "checking"} options={ACCOUNT_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
        </Field>
        <Field label="Cor" htmlFor="color-picker">
          <div className="flex h-12 items-center gap-2">
            {[preset.color, "#241127", "#C20F49", "#0E7A38", "#0B2A5B"].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Usar a cor ${c}`}
                aria-pressed={color.toUpperCase() === c.toUpperCase()}
                className={cn("size-8 rounded-full border-2", color.toUpperCase() === c.toUpperCase() ? "border-accent" : "border-transparent")}
                style={{ backgroundColor: c }}
              />
            ))}
            <label className="relative grid size-8 cursor-pointer place-items-center rounded-full border border-border-strong text-xs text-ink-3" title="Outra cor">
              +
              <input id="color-picker" type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </Field>
        <Field label="Saldo inicial" htmlFor="opening_balance" error={errorFor("opening_balance_cents")}>
          <MoneyInput id="opening_balance" name="opening_balance" allowNegative defaultValue={account ? asInput(account.openingBalance) : ""} />
        </Field>
        <Field label="Saldo no começo do dia" htmlFor="opening_date" error={errorFor("opening_date")}>
          <Input id="opening_date" name="opening_date" type="date" defaultValue={account?.openingDate ?? today} required />
        </Field>
      </div>
      <p className="text-sm text-ink-3">
        Use o saldo que o banco mostrava no começo desse dia. Lançamentos a partir dessa data atualizam o saldo. Saldo negativo: digite o sinal de menos.
      </p>
      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" loading={pending}>{account ? "Salvar alterações" : "Criar conta"}</Button>
      </div>
    </form>
  );
}

export function AdjustBalanceDialog({ id, name, balance }: { id: string; name: string; balance: Cents }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AccountActionResult, FormData>(adjustBalance, undefined);
  useDone(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Scale />Ajustar saldo</Button>
      </DialogTrigger>
      <DialogContent title={`Ajustar saldo de ${name}`} className="[--dialog-w:440px]">
        <form action={action} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            O NEXO calcula <strong className="font-semibold text-ink">{formatBRL(balance)}</strong>. Digite o saldo que o banco mostra agora; a diferença vira um lançamento de ajuste com a data de hoje.
          </p>
          <Field label="Saldo no banco agora" htmlFor="target">
            <MoneyInput id="target" name="target" allowNegative autoFocus />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={pending}>Ajustar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveAccountButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AccountActionResult, FormData>(removeAccount, undefined);
  useDone(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Excluir ${name}`}><Trash2 />Excluir</Button>
      </DialogTrigger>
      <DialogContent title={`Excluir ${name}?`} className="[--dialog-w:460px]">
        <form action={action} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            Sem lançamentos, a conta é apagada. Com lançamentos, ela é <strong className="font-semibold text-ink">arquivada</strong>: some das telas e dos totais, mas o histórico fica guardado.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="accent" loading={pending}>Excluir conta</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

