"use client";
import { useId, useState } from "react";
import { Field, Input } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Picker } from "@/components/ui/picker";
import type { QuickEntryData } from "@/lib/data/ledger";

/**
 * Campos "quem vai me pagar": nome, quanto, quando e em qual conta entra.
 * Enviados com prefixo reimb_ no mesmo formulário.
 */
export function ReimbursementFields({
  data,
  totalText,
  defaultDate,
  defaultAccountId,
  hint,
}: {
  data: QuickEntryData;
  totalText: string;
  defaultDate: string;
  defaultAccountId?: string | null;
  hint?: React.ReactNode;
}) {
  const listId = useId();
  // segue o valor da compra até a pessoa mudar o campo
  const [edited, setEdited] = useState<string | null>(null);
  const amount = edited ?? totalText;
  const [account, setAccount] = useState(defaultAccountId ?? data.accounts[0]?.id ?? "");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Quem vai pagar" htmlFor="reimb_who">
        <Input id="reimb_who" name="reimb_who" list={listId} maxLength={60} placeholder="Ex.: Ana" autoComplete="off" required />
        <datalist id={listId}>
          {data.people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Field>
      <Field
        label="Quanto"
        htmlFor="reimb_amount"
        hint={
          totalText && amount !== totalText ? (
            <button type="button" className="text-sm text-accent underline-offset-4 hover:underline" onClick={() => setEdited(null)}>
              Valor total
            </button>
          ) : undefined
        }
      >
        <MoneyInput id="reimb_amount" name="reimb_amount" value={amount} onValueChange={setEdited} />
      </Field>
      <Field label="Quando vai pagar" htmlFor="reimb_date">
        <Input id="reimb_date" name="reimb_date" type="date" defaultValue={defaultDate} required />
      </Field>
      <Field label="Entra na conta" htmlFor="reimb_account">
        <Picker
          id="reimb_account"
          name="reimb_account"
          value={account}
          onValueChange={setAccount}
          options={data.accounts.map((a) => ({ value: a.id, label: a.name, color: a.color }))}
          placeholder={data.accounts.length ? "Escolher conta" : "Cadastre uma conta"}
        />
      </Field>
      {hint && <p className="text-sm text-ink-3 sm:col-span-2">{hint}</p>}
    </div>
  );
}
