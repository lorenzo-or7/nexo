"use client";
import Link from "next/link";
import { ArrowDown, ChevronDown } from "lucide-react";
import * as React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { saveEntry, type EntryActionResult } from "@/app/(app)/lancamentos/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { defaultStatusFor, PAYMENT_METHODS, QUICK_KINDS, STATUS_LABEL, type QuickKind } from "@/domain/entries";
import type { EntryStatus } from "@/domain/ledger";
import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";
import type { CategoryOption, EntryRow, QuickEntryData } from "@/lib/data/ledger";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function toInput(c: Cents) {
  return formatBRL(Math.abs(c) as Cents).replace("R$ ", "");
}

export function EntryForm({
  data,
  initial,
  defaultAccountId,
  onDone,
}: {
  data: QuickEntryData;
  initial?: EntryRow;
  defaultAccountId?: string;
  onDone: () => void;
}) {
  const [round, setRound] = useState(0);
  const [sticky, setSticky] = useState<{ kind: QuickKind; accountId: string; date: string } | null>(null);
  if (data.accounts.length === 0) {
    return (
      <div className="grid gap-4 p-5 sm:p-6">
        <p className="text-ink-2">Para lançar despesas e receitas, cadastre primeiro a conta onde o dinheiro entra e sai.</p>
        <Button asChild className="justify-self-start">
          <Link href="/contas?nova=1" onClick={onDone}>Cadastrar conta</Link>
        </Button>
      </div>
    );
  }
  return (
    <FormBody
      key={round}
      data={data}
      initial={initial}
      sticky={sticky}
      defaultAccountId={defaultAccountId}
      onDone={onDone}
      onAgain={(s) => {
        setSticky(s);
        setRound((r) => r + 1);
      }}
    />
  );
}

function FormBody({
  data,
  initial,
  sticky,
  defaultAccountId,
  onDone,
  onAgain,
}: {
  data: QuickEntryData;
  initial?: EntryRow;
  sticky: { kind: QuickKind; accountId: string; date: string } | null;
  defaultAccountId?: string;
  onDone: () => void;
  onAgain: (s: { kind: QuickKind; accountId: string; date: string }) => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<EntryActionResult, FormData>(saveEntry, undefined);
  const editing = Boolean(initial);
  const initialKind: QuickKind = initial ? (initial.transfer ? "transfer" : (initial.kind as QuickKind)) : sticky?.kind ?? "expense";
  const [kind, setKind] = useState<QuickKind>(initialKind);
  const firstAccount = defaultAccountId ?? data.accounts[0].id;
  const [accountId, setAccountId] = useState(initial?.transfer?.fromId ?? initial?.accountId ?? sticky?.accountId ?? firstAccount);
  const [toAccountId, setToAccountId] = useState(initial?.transfer?.toId ?? data.accounts.find((a) => a.id !== accountId)?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? sticky?.date ?? data.today);
  const [status, setStatus] = useState<EntryStatus>(initial?.status ?? defaultStatusFor(sticky?.date ?? data.today, data.today, initialKind));
  const [statusTouched, setStatusTouched] = useState(editing);
  const [details, setDetails] = useState(Boolean(initial?.notes || initial?.tags.length || initial?.paymentMethod));
  const [idempotencyKey] = useState(newKey);
  const againRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) amountRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!state?.ok) return;
    toast.show({ tone: "success", message: state.message });
    if (state.again) onAgain({ kind, accountId, date });
    else onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);
  const generalError = state && !state.ok && !["amount", "account_id", "to_account_id", "occurred_on", "status", "description"].includes(state.field ?? "") ? state.error : undefined;
  const categoryKind = kind === "income" ? "income" : "expense";
  const tone = kind === "expense" ? "text-negative" : kind === "transfer" ? "text-ink" : "text-positive";

  return (
    <form action={action} className="grid gap-5 p-5 sm:p-6" noValidate>
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />
      <input type="hidden" name="again" ref={againRef} defaultValue="0" />
      <input type="hidden" name="kind" value={kind} />
      {initial && !initial.transfer && <input type="hidden" name="id" value={initial.id} />}
      {initial?.transfer && <input type="hidden" name="transfer_id" value={initial.transfer.id} />}
      {initial && <input type="hidden" name="version" value={initial.version} />}

      {generalError && <FormMessage tone="error">{generalError}</FormMessage>}

      {/* tipo */}
      <div role="radiogroup" aria-label="Tipo de lançamento" className="grid grid-cols-4 gap-1 rounded-2xl bg-surface-2 p-1">
        {QUICK_KINDS.map((k) => {
          const locked = editing && (k.key === "transfer") !== (initialKind === "transfer");
          return (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              disabled={locked}
              onClick={() => {
                setKind(k.key);
                if (!statusTouched) setStatus(defaultStatusFor(date, data.today, k.key));
              }}
              className={cn(
                "h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-35",
                kind === k.key ? "bg-surface text-ink shadow-[0_1px_3px_rgba(36,17,39,0.18)]" : "text-ink-2 hover:text-ink",
              )}
            >
              <span className="sm:hidden" aria-hidden>{k.short}</span>
              <span className="max-sm:sr-only">{k.label}</span>
            </button>
          );
        })}
      </div>

      {/* valor */}
      <div className="grid gap-1.5">
        <label htmlFor="amount" className="text-sm font-medium text-ink-2">Valor</label>
        <div className={cn("flex items-baseline gap-2 border-b-2 border-border-strong pb-1 focus-within:border-accent", errorFor("amount") && "border-negative")}>
          <span className={cn("text-2xl font-semibold", tone)}>R$</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            defaultValue={initial ? toInput(initial.transfer ? initial.transfer.amount : initial.amount) : ""}
            aria-invalid={Boolean(errorFor("amount")) || undefined}
            className={cn("tabular w-full bg-transparent text-[2.25rem] font-semibold tracking-[-0.03em] outline-none placeholder:text-ink-3/60", tone)}
          />
        </div>
        {errorFor("amount") && <p role="alert" className="text-sm text-negative">{errorFor("amount")}</p>}
      </div>

      <Field label="Descrição" htmlFor="description" error={errorFor("description")}>
        <Input id="description" name="description" maxLength={140} defaultValue={initial?.description ?? ""} placeholder={kind === "transfer" ? "Ex.: Reserva do mês" : kind === "expense" ? "Ex.: Mercado" : "Ex.: Salário"} />
      </Field>

      {kind === "transfer" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
          <Field label="De" htmlFor="account_id" error={errorFor("account_id")}>
            <AccountSelect id="account_id" value={accountId} onChange={setAccountId} data={data} />
          </Field>
          <ArrowDown className="mx-auto mb-3.5 size-4 text-ink-3 sm:-rotate-90" aria-hidden />
          <Field label="Para" htmlFor="to_account_id" error={errorFor("to_account_id")}>
            <AccountSelect id="to_account_id" value={toAccountId} onChange={setToAccountId} data={data} placeholder={data.accounts.length < 2 ? "Cadastre outra conta" : undefined} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={kind === "expense" ? "Sai da conta" : "Entra na conta"} htmlFor="account_id" error={errorFor("account_id")}>
            <AccountSelect id="account_id" value={accountId} onChange={setAccountId} data={data} />
          </Field>
          <Field label="Categoria" htmlFor="category_id">
            <CategorySelect key={categoryKind} kind={categoryKind} categories={data.categories} defaultValue={initial?.categoryId ?? ""} />
          </Field>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Data" htmlFor="occurred_on" error={errorFor("occurred_on")}>
          <Input
            id="occurred_on"
            name="occurred_on"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              if (!statusTouched && e.target.value) setStatus(defaultStatusFor(e.target.value, data.today, kind));
            }}
            required
          />
        </Field>
        <Field label="Situação" htmlFor="status" error={errorFor("status")}>
          <Select
            id="status"
            name="status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EntryStatus);
              setStatusTouched(true);
            }}
          >
            {(Object.keys(STATUS_LABEL) as EntryStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
                {s === "confirmed" ? " (já aconteceu)" : s === "scheduled" ? " (vai acontecer)" : " (pode não acontecer)"}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {kind !== "transfer" && (
        <div className="grid gap-5">
          <button
            type="button"
            onClick={() => setDetails((d) => !d)}
            aria-expanded={details}
            className="flex items-center gap-1.5 justify-self-start text-sm font-medium text-ink-2 hover:text-ink"
          >
            <ChevronDown className={cn("size-4 transition-transform", details && "rotate-180")} />
            Mais detalhes
          </button>
          <div className={cn("grid gap-5 sm:grid-cols-2", !details && "hidden")}>
            <Field label="Forma de pagamento" htmlFor="payment_method">
              <Select id="payment_method" name="payment_method" defaultValue={initial?.paymentMethod ?? ""}>
                <option value="">Não informar</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tags" htmlFor="tags">
              <Input id="tags" name="tags" defaultValue={initial?.tags.join(", ") ?? ""} placeholder="Ex.: viagem, presente" />
            </Field>
            <Field label="Observações" htmlFor="notes" className="sm:col-span-2">
              <textarea
                id="notes"
                name="notes"
                rows={2}
                maxLength={2000}
                defaultValue={initial?.notes ?? ""}
                className="w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 py-3 text-base text-ink focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none"
              />
            </Field>
          </div>
        </div>
      )}
      {kind === "transfer" && <input type="hidden" name="tags" value="" />}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-wrap justify-end gap-3 border-t border-border bg-surface px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
        {!editing && (
          <Button type="submit" variant="ghost" loading={pending} onClick={() => againRef.current && (againRef.current.value = "1")}>
            Salvar e lançar outro
          </Button>
        )}
        <Button type="submit" loading={pending} onClick={() => againRef.current && (againRef.current.value = "0")}>
          {editing ? "Salvar alterações" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}

function AccountSelect({ id, value, onChange, data, placeholder }: { id: string; value: string; onChange: (v: string) => void; data: QuickEntryData; placeholder?: string }) {
  return (
    <Select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} required>
      {placeholder && <option value="">{placeholder}</option>}
      {data.accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.institution && a.institution !== a.name ? ` · ${a.institution}` : ""}
        </option>
      ))}
    </Select>
  );
}

function CategorySelect({ kind, categories, defaultValue }: { kind: "expense" | "income"; categories: CategoryOption[]; defaultValue: string }) {
  const parents = categories.filter((c) => c.kind === kind && !c.parentId);
  return (
    <Select id="category_id" name="category_id" defaultValue={defaultValue}>
      <option value="">Sem categoria</option>
      {parents.map((p) => {
        const children = categories.filter((c) => c.parentId === p.id);
        return (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name} (geral)</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
