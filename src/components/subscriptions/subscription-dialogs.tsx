"use client";
import { Pause, Play, RotateCcw, Trash2, XCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { changeSubscriptionStatus, removeSubscription, saveSubscription, type SubscriptionActionResult } from "@/app/(app)/assinaturas/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { MoneyInput } from "@/components/ui/money-input";
import { Picker, type PickerOption } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { categoryColor, categoryTree } from "@/domain/categories";
import { formatDateBR, type LocalDate } from "@/domain/dates";
import { centsToInput, type Cents } from "@/domain/money";
import { FREQUENCY_PRESETS } from "@/domain/subscriptions";
import type { QuickEntryData } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";

export interface SubscriptionItem {
  id: string;
  name: string;
  status: "active" | "paused" | "cancelled";
  price: Cents;
  per: string;
  frequencyLabel: string;
  presetKey: string;
  monthly: Cents;
  nextDate: LocalDate | null;
  daysToNext: number | null;
  alertDays: number;
  pay: string;
  payLabel: string;
  payColor: string;
  categoryId: string | null;
  categoryName: string | null;
  color: string;
  chargesCount: number;
  totalPaid: Cents;
  pausedFrom: LocalDate | null;
  cancelledAt: LocalDate | null;
  startDate: LocalDate;
}

function useDone(state: SubscriptionActionResult, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function SubscriptionEditor({
  item,
  data,
  open,
  onOpenChange,
}: {
  item?: SubscriptionItem;
  data: QuickEntryData;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? `Editar ${item.name}` : "Nova assinatura"}
        description="Cobranças que vencem viram lançamentos sozinhas; as próximas já entram na previsão do saldo."
        className="[--dialog-w:560px]"
      >
        {open && <SubscriptionForm item={item} data={data} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionForm({ item, data, onDone }: { item?: SubscriptionItem; data: QuickEntryData; onDone: () => void }) {
  const [state, action, pending] = useActionState<SubscriptionActionResult, FormData>(saveSubscription, undefined);
  useDone(state, onDone);
  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);
  const [date, setDate] = useState<string>(item?.nextDate ?? data.today);

  const payOptions: PickerOption[] = [
    ...data.cards.map((k) => ({ value: `card:${k.id}`, label: k.name, group: "Cartão de crédito", color: k.color })),
    ...data.accounts.map((a) => ({ value: `account:${a.id}`, label: a.name, group: "Débito em conta", color: a.color })),
  ];
  const defaultPay = item?.pay ?? payOptions[0]?.value ?? "";

  // sugestão: a categoria "Assinaturas", se existir
  const subsParent = data.categories.find((c) => !c.parentId && c.kind === "expense" && c.name.toLowerCase() === "assinaturas");
  const catOptions: PickerOption[] = [{ value: "", label: "Sem categoria" }];
  for (const { parent, children } of categoryTree(data.categories, "expense")) {
    catOptions.push({ value: parent.id, label: `${parent.name} (geral)`, group: parent.name, color: categoryColor(parent, data.categories) });
    for (const c of children) catOptions.push({ value: c.id, label: c.name, group: parent.name, color: categoryColor(c, data.categories) });
  }

  if (payOptions.length === 0) {
    return (
      <div className="grid gap-4 p-5 sm:p-6">
        <p className="text-ink-2">Cadastre uma conta ou um cartão antes: a assinatura precisa saber de onde sai o dinheiro.</p>
        <div className="flex justify-end">
          <Button type="button" onClick={onDone}>Entendi</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-5 p-5 sm:p-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      {state && !state.ok && !state.field && <FormMessage tone="error">{state.error}</FormMessage>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_11rem]">
        <Field label="Nome" htmlFor="sub-name" error={errorFor("name")}>
          <Input id="sub-name" name="name" defaultValue={item?.name ?? ""} maxLength={60} required autoFocus placeholder="Ex.: Netflix, Spotify, ChatGPT" />
        </Field>
        <Field label="Valor" htmlFor="sub-amount" error={errorFor("amount")}>
          <MoneyInput id="sub-amount" name="amount" defaultValue={item ? centsToInput(item.price) : ""} placeholder="0,00" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Frequência" htmlFor="sub-preset" error={errorFor("preset")}>
          <Picker id="sub-preset" name="preset" defaultValue={item?.presetKey ?? "monthly"} options={FREQUENCY_PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
        </Field>
        <Field label={item ? "Próxima cobrança" : "Primeira cobrança"} htmlFor="sub-date" error={errorFor("next_date")}>
          <DatePicker id="sub-date" name="next_date" value={date} onValueChange={setDate} today={data.today} />
        </Field>
        <Field label="Pago com" htmlFor="sub-pay" error={errorFor("pay")}>
          <Picker id="sub-pay" name="pay" defaultValue={defaultPay} options={payOptions} />
        </Field>
        <Field label="Categoria" htmlFor="sub-category">
          <Picker id="sub-category" name="category_id" defaultValue={item ? item.categoryId ?? "" : subsParent?.id ?? ""} options={catOptions} />
        </Field>
      </div>

      <p className={cn("rounded-xl bg-surface-2 px-4 py-3 text-sm", !item && date < data.today ? "text-warning" : "text-ink-2")}>
        {item
          ? `Um novo valor vale a partir de ${formatDateBR(date as LocalDate)}. Cobranças já lançadas não mudam.`
          : date < data.today
            ? `Data no passado: as cobranças desde ${formatDateBR(date as LocalDate)} serão lançadas agora.`
            : "No cartão, cada cobrança entra na fatura certa. Na conta, vira uma despesa no dia."}
      </p>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" loading={pending}>{item ? "Salvar alterações" : "Criar assinatura"}</Button>
      </div>
    </form>
  );
}

const iconBtn = "grid size-9 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50";

/** Pausar / retomar / cancelar / reativar — um clique, sem confirmação (é reversível). */
export function StatusButton({ item, action }: { item: SubscriptionItem; action: "pause" | "resume" | "reactivate" }) {
  const [state, run, pending] = useActionState<SubscriptionActionResult, FormData>(changeSubscriptionStatus, undefined);
  useDone(state, () => {});
  const meta = {
    pause: { icon: Pause, label: `Pausar ${item.name}`, title: "Pausar" },
    resume: { icon: Play, label: `Retomar ${item.name}`, title: "Retomar" },
    reactivate: { icon: RotateCcw, label: `Reativar ${item.name}`, title: "Reativar" },
  }[action];
  return (
    <form action={run}>
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="action" value={action} />
      <button type="submit" disabled={pending} aria-label={meta.label} title={meta.title} className={iconBtn}>
        <meta.icon className="size-4" />
      </button>
    </form>
  );
}

export function CancelSubscriptionButton({ item }: { item: SubscriptionItem }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState<SubscriptionActionResult, FormData>(changeSubscriptionStatus, undefined);
  useDone(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" aria-label={`Cancelar ${item.name}`} title="Cancelar" className={cn(iconBtn, "hover:bg-accent-soft hover:text-negative")}>
          <XCircle className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent title={`Cancelar ${item.name}?`} className="[--dialog-w:460px]">
        <form action={run} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="action" value="cancel" />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            Para de gerar cobranças a partir de hoje e sai da previsão do saldo. O que já foi cobrado continua no histórico. Dá para reativar depois.
          </p>
          <p className="text-sm text-ink-3">Lembre-se de cancelar também no serviço — o NEXO só organiza o seu controle.</p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Voltar</Button>
            <Button type="submit" variant="accent" loading={pending}>Cancelar assinatura</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveSubscriptionButton({ item }: { item: SubscriptionItem }) {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState<SubscriptionActionResult, FormData>(removeSubscription, undefined);
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
            {item.chargesCount > 0
              ? "Ela já tem cobranças lançadas, então fica cancelada e o histórico é mantido."
              : "Ainda não houve cobrança: ela é apagada de vez."}
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
