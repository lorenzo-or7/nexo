"use client";
import Link from "next/link";
import { ArrowDown, ChevronDown, CreditCard } from "lucide-react";
import * as React from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { saveEntry, type EntryActionResult } from "@/app/(app)/lancamentos/actions";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Picker, type PickerOption } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { dueDateOf, invoiceRefForPurchase } from "@/domain/billing";
import { formatDateBR, formatMonthBR } from "@/domain/dates";
import { billingConfigOf, defaultStatusFor, PAYMENT_METHODS, QUICK_KINDS, STATUS_LABEL, type QuickKind } from "@/domain/entries";
import type { EntryStatus } from "@/domain/ledger";
import { formatBRL, parseBRL, splitEven, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";
import type { CategoryOption, EntryRow, QuickEntryData } from "@/lib/data/ledger";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function toInput(c: Cents) {
  return formatBRL(Math.abs(c) as Cents).replace("R$ ", "");
}

function tryParse(v: string): Cents | null {
  try {
    const c = parseBRL(v);
    return c > 0 ? c : null;
  } catch {
    return null;
  }
}

type Sticky = { kind: QuickKind; accountId: string; date: string; method: string; cardId: string };

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
  const [sticky, setSticky] = useState<Sticky | null>(null);
  if (data.accounts.length === 0 && data.cards.length === 0) {
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
  sticky: Sticky | null;
  defaultAccountId?: string;
  onDone: () => void;
  onAgain: (s: Sticky) => void;
}) {
  const toast = useToast();
  const [state, action, pending] = useActionState<EntryActionResult, FormData>(saveEntry, undefined);
  const editing = Boolean(initial);
  const initialKind: QuickKind = initial ? (initial.transfer ? "transfer" : (initial.kind as QuickKind)) : sticky?.kind ?? "expense";
  const [kind, setKind] = useState<QuickKind>(initialKind);
  const firstAccount = defaultAccountId ?? data.accounts[0]?.id ?? "";
  const [accountId, setAccountId] = useState(initial?.transfer?.fromId ?? initial?.accountId ?? sticky?.accountId ?? firstAccount);
  const [toAccountId, setToAccountId] = useState(initial?.transfer?.toId ?? data.accounts.find((a) => a.id !== accountId)?.id ?? "");
  const [date, setDate] = useState(initial?.date ?? sticky?.date ?? data.today);
  const [status, setStatus] = useState<EntryStatus>(initial?.status ?? defaultStatusFor(sticky?.date ?? data.today, data.today, initialKind));
  const [statusTouched, setStatusTouched] = useState(editing);
  const [method, setMethod] = useState(initial?.paymentMethod ?? sticky?.method ?? (data.accounts.length === 0 && data.cards.length > 0 ? "credit" : ""));
  const [cardId, setCardId] = useState(sticky?.cardId ?? data.cards[0]?.id ?? "");
  const [installments, setInstallments] = useState("1");
  const [amountText, setAmountText] = useState(initial ? toInput(initial.transfer ? initial.transfer.amount : initial.amount) : "");
  const [details, setDetails] = useState(Boolean(initial?.notes || initial?.tags.length));
  const [idempotencyKey] = useState(newKey);
  const againRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const isCredit = kind === "expense" && method === "credit" && !editing;

  useEffect(() => {
    if (!editing) amountRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (!state?.ok) return;
    toast.show({ tone: "success", message: state.message });
    if (state.again) onAgain({ kind, accountId, date, method, cardId });
    else onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // em qual fatura a compra cai, e o valor de cada parcela
  const creditPreview = useMemo(() => {
    if (!isCredit) return null;
    const card = data.cards.find((c) => c.id === cardId);
    if (!card || !date) return null;
    try {
      const config = billingConfigOf(card);
      const ref = invoiceRefForPurchase(config, date);
      const n = Number(installments);
      const total = tryParse(amountText);
      const parts = total ? splitEven(total, n) : null;
      return { ref, due: dueDateOf(config, ref), n, parts };
    } catch {
      return null;
    }
  }, [isCredit, data.cards, cardId, date, installments, amountText]);

  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);
  const known = ["amount", "account_id", "to_account_id", "occurred_on", "status", "description", "card_id", "installments"];
  const generalError = state && !state.ok && !known.includes(state.field ?? "") ? state.error : undefined;
  const categoryKind = kind === "income" ? "income" : "expense";
  const tone = kind === "expense" ? "text-negative" : kind === "transfer" ? "text-ink" : "text-positive";

  const accountOptions: PickerOption[] = data.accounts.map((a) => ({ value: a.id, label: a.name, hint: a.institution && a.institution !== a.name ? a.institution : undefined, color: a.color }));
  const methodOptions: PickerOption[] = [
    { value: "", label: "Não informar" },
    ...PAYMENT_METHODS.filter((m) => m.key !== "credit" || (kind === "expense" && !editing)).map((m) => ({
      value: m.key,
      label: m.label,
      hint: m.key === "credit" ? (data.cards.length ? "cartão" : "cadastre um cartão") : undefined,
    })),
  ];

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
      <div role="radiogroup" aria-label="Tipo de lançamento" className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-field p-1">
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
                if (k.key !== "expense" && method === "credit") setMethod("");
                if (!statusTouched) setStatus(defaultStatusFor(date, data.today, k.key));
              }}
              className={cn(
                "h-10 rounded-xl text-sm font-medium transition-colors disabled:opacity-35",
                kind === k.key ? "bg-surface-2 text-ink shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--accent)_45%,transparent),0_6px_16px_-10px_var(--accent)]" : "text-ink-2 hover:text-ink",
              )}
            >
              <span className="sm:hidden" aria-hidden>{k.short}</span>
              <span className="max-sm:sr-only">{k.label}</span>
            </button>
          );
        })}
      </div>

      {/* valor: o foco aparece só na linha de baixo */}
      <div className="grid gap-1.5">
        <label htmlFor="amount" className="text-sm font-medium text-ink-2">Valor</label>
        <div className={cn("flex items-baseline gap-2 border-b-2 border-border-strong pb-1 transition-colors focus-within:border-accent", errorFor("amount") && "border-negative")}>
          <span className={cn("text-2xl font-semibold", tone)}>R$</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value.replace(/[^\d.,]/g, ""))}
            aria-invalid={Boolean(errorFor("amount")) || undefined}
            className={cn("tabular w-full appearance-none border-0 bg-transparent p-0 text-[2.25rem] font-semibold tracking-[-0.03em] shadow-none outline-none ring-0 placeholder:text-ink-3/60 focus:outline-none focus:ring-0", tone)}
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
            <Picker id="account_id" name="account_id" value={accountId} onValueChange={setAccountId} options={accountOptions} />
          </Field>
          <ArrowDown className="mx-auto mb-3.5 size-4 text-ink-3 sm:-rotate-90" aria-hidden />
          <Field label="Para" htmlFor="to_account_id" error={errorFor("to_account_id")}>
            <Picker id="to_account_id" name="to_account_id" value={toAccountId} onValueChange={setToAccountId} options={accountOptions} placeholder={data.accounts.length < 2 ? "Cadastre outra conta" : "Escolher conta"} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {kind === "expense" && (
            <Field label="Forma de pagamento" htmlFor="payment_method">
              <Picker id="payment_method" name="payment_method" value={method} onValueChange={setMethod} options={methodOptions} />
            </Field>
          )}
          {isCredit ? (
            <Field label="Cartão" htmlFor="card_id" error={errorFor("card_id")}>
              {data.cards.length ? (
                <Picker
                  id="card_id"
                  name="card_id"
                  value={cardId}
                  onValueChange={setCardId}
                  options={data.cards.map((c) => ({ value: c.id, label: c.name, hint: c.institution && c.institution !== c.name ? c.institution : undefined, color: c.color }))}
                />
              ) : (
                <Link href="/cartoes?novo=1" className="flex h-12 items-center rounded-[var(--radius-control)] border border-dashed border-border-strong px-4 text-sm text-accent">
                  Cadastrar cartão
                </Link>
              )}
            </Field>
          ) : (
            <Field label={kind === "expense" ? "Sai da conta" : "Entra na conta"} htmlFor="account_id" error={errorFor("account_id")}>
              <Picker id="account_id" name="account_id" value={accountId} onValueChange={setAccountId} options={accountOptions} placeholder="Escolher conta" />
            </Field>
          )}
          {isCredit && (
            <Field label="Parcelas" htmlFor="installments" error={errorFor("installments")}>
              <Picker
                id="installments"
                name="installments"
                value={installments}
                onValueChange={setInstallments}
                options={Array.from({ length: 24 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? "À vista (1x)" : `${i + 1}x` }))}
              />
            </Field>
          )}
          <Field label="Categoria" htmlFor="category_id" className={cn(kind !== "expense" && "sm:col-span-2")}>
            <CategoryPicker key={categoryKind} kind={categoryKind} categories={data.categories} defaultValue={initial?.categoryId ?? ""} />
          </Field>
        </div>
      )}

      {creditPreview && (
        <p className="flex items-start gap-2.5 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            {creditPreview.n > 1 && creditPreview.parts
              ? <>{creditPreview.n}x de <strong className="font-semibold text-ink">{formatBRL(creditPreview.parts[0])}</strong>{creditPreview.parts.at(-1) !== creditPreview.parts[0] && <> (a última de {formatBRL(creditPreview.parts.at(-1)!)})</>}, </>
              : null}
            {creditPreview.n > 1 ? "a primeira " : "Entra "}na fatura de <strong className="font-semibold text-ink">{formatMonthBR(creditPreview.ref)}</strong>, que vence em {formatDateBR(creditPreview.due)}. O saldo da conta só muda quando a fatura for paga.
          </span>
        </p>
      )}

      <div className={cn("grid gap-5", !isCredit && "sm:grid-cols-2")}>
        <Field label={isCredit ? "Data da compra" : "Data"} htmlFor="occurred_on" error={errorFor("occurred_on")}>
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
        {isCredit ? (
          <input type="hidden" name="status" value="confirmed" />
        ) : (
          <Field label="Situação" htmlFor="status" error={errorFor("status")}>
            <Picker
              id="status"
              name="status"
              value={status}
              onValueChange={(v) => {
                setStatus(v as EntryStatus);
                setStatusTouched(true);
              }}
              options={(Object.keys(STATUS_LABEL) as EntryStatus[]).map((s) => ({
                value: s,
                label: STATUS_LABEL[s],
                hint: s === "confirmed" ? "já aconteceu" : s === "scheduled" ? "vai acontecer" : "pode não acontecer",
              }))}
            />
          </Field>
        )}
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
          <div className={cn("grid gap-5", !details && "hidden")}>
            {kind !== "expense" && (
              <Field label="Forma de recebimento" htmlFor="payment_method">
                <Picker id="payment_method" name="payment_method" value={method} onValueChange={setMethod} options={methodOptions} />
              </Field>
            )}
            <Field label="Tags" htmlFor="tags">
              <Input id="tags" name="tags" defaultValue={initial?.tags.join(", ") ?? ""} placeholder="Ex.: viagem, presente" />
            </Field>
            <Field label="Observações" htmlFor="notes">
              <textarea
                id="notes"
                name="notes"
                rows={2}
                maxLength={2000}
                defaultValue={initial?.notes ?? ""}
                className="w-full rounded-[var(--radius-control)] border border-border-strong bg-field px-4 py-3 text-base text-ink focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none"
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

function CategoryPicker({ kind, categories, defaultValue }: { kind: "expense" | "income"; categories: CategoryOption[]; defaultValue: string }) {
  const options: PickerOption[] = [{ value: "", label: "Sem categoria" }];
  for (const p of categories.filter((c) => c.kind === kind && !c.parentId)) {
    options.push({ value: p.id, label: `${p.name} (geral)`, group: p.name });
    for (const c of categories.filter((x) => x.parentId === p.id)) options.push({ value: c.id, label: c.name, group: p.name });
  }
  return <Picker id="category_id" name="category_id" defaultValue={defaultValue} options={options} />;
}
