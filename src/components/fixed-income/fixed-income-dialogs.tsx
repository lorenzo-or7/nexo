"use client";
import { Pause, Play, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { changeFixedIncomeStatus, removeFixedIncome, saveFixedIncome, type FixedIncomeActionResult } from "@/app/(app)/renda-fixa/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Picker, type PickerOption } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { categoryColor, categoryTree } from "@/domain/categories";
import { formatDateBR, parseDate, type LocalDate } from "@/domain/dates";
import type { FixedIncomeKind, FixedIncomeStatus } from "@/domain/fixed-income";
import { centsToInput, type Cents } from "@/domain/money";
import type { QuickEntryData } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";

export interface FixedIncomeItem {
  id: string;
  kind: FixedIncomeKind;
  name: string;
  clientName: string | null;
  amount: Cents;
  dayOfMonth: number;
  startDate: LocalDate;
  endDate: LocalDate | null;
  status: FixedIncomeStatus;
  accountId: string;
  accountName: string;
  accountColor: string;
  categoryId: string | null;
  categoryName: string | null;
  color: string;
  notes: string | null;
  nextDate: LocalDate | null;
  daysToNext: number | null;
  receivedCount: number;
  receivedTotal: Cents;
}

function useDone(state: FixedIncomeActionResult, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function FixedIncomeEditor({
  item,
  initialKind,
  data,
  open,
  onOpenChange,
}: {
  item?: FixedIncomeItem;
  initialKind?: FixedIncomeKind;
  data: QuickEntryData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Editar ${item.name}` : "Nova renda fixa"}
        description="Todo mês o recebimento entra como previsto no dia combinado e já conta na previsão do saldo."
        className="[--dialog-w:580px]"
      >
        {open && <FixedIncomeForm item={item} initialKind={initialKind} data={data} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FixedIncomeForm({ item, initialKind, data, onDone }: { item?: FixedIncomeItem; initialKind?: FixedIncomeKind; data: QuickEntryData; onDone: () => void }) {
  const [state, action, pending] = useActionState<FixedIncomeActionResult, FormData>(saveFixedIncome, undefined);
  useDone(state, onDone);
  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);
  const [kind, setKind] = useState<FixedIncomeKind>(item?.kind ?? initialKind ?? "client");
  const [start, setStart] = useState<string>(item?.startDate ?? data.today);
  const [end, setEnd] = useState<string>(item?.endDate ?? "");

  const accountOptions: PickerOption[] = data.accounts.map((a) => ({ value: a.id, label: a.name, color: a.color }));
  const catOptions: PickerOption[] = [{ value: "", label: "Sem categoria" }];
  for (const { parent, children } of categoryTree(data.categories, "income")) {
    catOptions.push({ value: parent.id, label: `${parent.name} (geral)`, group: parent.name, color: categoryColor(parent, data.categories) });
    for (const c of children) catOptions.push({ value: c.id, label: c.name, group: parent.name, color: categoryColor(c, data.categories) });
  }
  // sugestão: "Salário"/"Receitas" para salário, "Freelance"/"Receitas" para clientes
  const suggested = data.categories.find((c) => c.kind === "income" && c.name.toLowerCase() === (kind === "salary" ? "salário" : "freelance"));

  if (accountOptions.length === 0) {
    return (
      <div className="grid gap-4 p-5 sm:p-6">
        <p className="text-ink-2">Cadastre uma conta antes: a renda precisa saber em qual conta o dinheiro entra.</p>
        <div className="flex justify-end">
          <Button type="button" onClick={onDone}>Entendi</Button>
        </div>
      </div>
    );
  }

  const day = start ? parseDate(start as LocalDate).day : null;

  return (
    <form action={action} className="grid gap-5 p-5 sm:p-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      {state && !state.ok && !state.field && <FormMessage tone="error">{state.error}</FormMessage>}

      <div role="radiogroup" aria-label="Tipo de renda" className="panel-quiet grid grid-cols-2 gap-1 rounded-full p-1">
        {(["client", "salary"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("h-10 rounded-full text-sm font-medium transition-colors", kind === k ? "btn-glow" : "text-ink-2 hover:text-ink")}
          >
            {k === "client" ? "Mensalidade de cliente" : "Salário"}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_11rem]">
        <Field label={kind === "salary" ? "Nome" : "Negociação"} htmlFor="fi-name" error={errorFor("name")}>
          <Input
            id="fi-name"
            name="name"
            defaultValue={item?.name ?? ""}
            maxLength={80}
            required
            autoFocus
            placeholder={kind === "salary" ? "Ex.: Salário Ágere" : "Ex.: Manutenção do site"}
          />
        </Field>
        <Field label="Valor por mês" htmlFor="fi-amount" error={errorFor("amount")}>
          <MoneyInput id="fi-amount" name="amount" defaultValue={item ? centsToInput(item.amount) : ""} placeholder="0,00" />
        </Field>
      </div>

      {kind === "client" && (
        <Field label="Cliente" htmlFor="fi-client" error={errorFor("client_name")}>
          <Input id="fi-client" name="client_name" defaultValue={item?.clientName ?? ""} maxLength={80} placeholder="Ex.: Namba" />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Primeiro recebimento" htmlFor="fi-start" error={errorFor("start_date")} hint={day ? <span className="text-xs text-ink-3">todo dia {day}</span> : undefined}>
          <DatePicker id="fi-start" name="start_date" value={start} onValueChange={setStart} today={data.today} />
        </Field>
        <Field
          label={kind === "client" ? "Fim do contrato" : "Fim (opcional)"}
          htmlFor="fi-end"
          error={errorFor("end_date")}
          hint={end ? <button type="button" onClick={() => setEnd("")} className="inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"><X className="size-3" />sem fim</button> : undefined}
        >
          <DatePicker id="fi-end" name="end_date" value={end} onValueChange={setEnd} today={data.today} placeholder="Sem data de fim" />
        </Field>
        <Field label="Cai na conta" htmlFor="fi-account" error={errorFor("account_id")}>
          <Picker id="fi-account" name="account_id" defaultValue={item?.accountId ?? accountOptions[0].value} options={accountOptions} />
        </Field>
        <Field label="Categoria" htmlFor="fi-category">
          <Picker key={kind} id="fi-category" name="category_id" defaultValue={item ? item.categoryId ?? "" : suggested?.id ?? ""} options={catOptions} />
        </Field>
      </div>

      <Field label="Observações (opcional)" htmlFor="fi-notes" error={errorFor("notes")}>
        <Input id="fi-notes" name="notes" defaultValue={item?.notes ?? ""} maxLength={500} placeholder="Ex.: reajuste em janeiro, nota fiscal até dia 3" />
      </Field>

      <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        {item
          ? "Mudanças valem para os próximos recebimentos e para os que ainda estão previstos. O que já foi marcado como realizado não muda."
          : start < data.today
            ? "Data no passado: só o mês atual e o anterior entram como previstos; os mais antigos você lança no Extrato se precisar."
            : "Quando o dinheiro cair, marque como Realizado no Extrato (ou no painel de próximos vencimentos)."}
        {end && ` O último recebimento será em ${formatDateBR(end as LocalDate)} ou antes.`}
      </p>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" loading={pending}>{item ? "Salvar alterações" : "Cadastrar renda"}</Button>
      </div>
    </form>
  );
}

const iconBtn = "grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50";

export function FixedStatusButton({ item, action }: { item: FixedIncomeItem; action: "pause" | "resume" }) {
  const [state, run, pending] = useActionState<FixedIncomeActionResult, FormData>(changeFixedIncomeStatus, undefined);
  useDone(state, () => {});
  const Icon = action === "pause" ? Pause : Play;
  const title = action === "pause" ? "Pausar" : "Retomar";
  return (
    <form action={run}>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" disabled={pending} aria-label={`${title} ${item.name}`} title={title} className={iconBtn}>
        <Icon className="size-4" />
      </button>
    </form>
  );
}

export function RemoveFixedIncomeButton({ item }: { item: FixedIncomeItem }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState<FixedIncomeActionResult, FormData>(removeFixedIncome, undefined);
  useDone(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" aria-label={`Excluir ${item.name}`} title="Excluir" className={cn(iconBtn, "hover:bg-accent-soft hover:text-negative")}>
          <Trash2 className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent title={`Excluir ${item.name}?`} className="[--dialog-w:460px]">
        <form action={run} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={item.id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            {item.receivedCount > 0
              ? "Já há recebimentos registrados, então ela é encerrada: para de gerar novos meses e o histórico fica no Extrato."
              : "Ainda não há recebimentos confirmados: ela é apagada de vez."}
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
            <Button type="submit" variant="accent" loading={pending}>Excluir</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
