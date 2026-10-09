"use client";
/* eslint-disable @next/next/no-img-element -- prévias locais (blob:) e URLs assinadas */
import { ImageUp, Trash2 } from "lucide-react";
import * as React from "react";
import { useActionState, useEffect, useState } from "react";
import { saveCard, type CardActionResult } from "@/app/(app)/cartoes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { BANKS, CARD_BRANDS, bankByKey } from "@/domain/banks";
import { formatBRL, type Cents } from "@/domain/money";
import { cn } from "@/lib/cn";
import { BankCardFace } from "./bank-card-face";

export interface EditableCard {
  id: string;
  name: string;
  institutionKey: string | null;
  brand: string;
  lastFour: string | null;
  color: string;
  limit: Cents;
  closingDay: number;
  dueDay: number;
  closingDayRule: "next_invoice" | "current_invoice";
  paymentAccountId: string | null;
  logoUrl: string | null;
  artUrl: string | null;
  hasLogo: boolean;
  hasArt: boolean;
}

const MAX = 2 * 1024 * 1024;

export function CardEditor({
  card,
  accounts,
  trigger,
  defaultOpen,
}: {
  card?: EditableCard;
  accounts: { id: string; name: string }[];
  trigger: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title={card ? "Editar cartão" : "Adicionar cartão"}
        description="Só os 4 últimos dígitos. O NEXO nunca pede o número completo nem o CVV."
        className="[--dialog-w:880px]"
      >
        {/* remonta o formulário a cada abertura para começar limpo */}
        {open && <CardForm card={card} accounts={accounts} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CardForm({ card, accounts, onDone }: { card?: EditableCard; accounts: { id: string; name: string }[]; onDone: () => void }) {
  const toast = useToast();
  const [state, action, pending] = useActionState<CardActionResult, FormData>(saveCard, undefined);
  const [institution, setInstitution] = useState(card?.institutionKey ?? "nubank");
  const [name, setName] = useState(card?.name ?? "");
  const [brand, setBrand] = useState(card?.brand ?? "mastercard");
  const [lastFour, setLastFour] = useState(card?.lastFour ?? "");
  const [color, setColor] = useState(card?.color ?? bankByKey("nubank").color);
  const [logo, setLogo] = useState<ImageState>({ url: card?.logoUrl ?? null, removed: false, error: null });
  const [art, setArt] = useState<ImageState>({ url: card?.artUrl ?? null, removed: false, error: null });

  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      onDone();
    }
  }, [state, toast, onDone]);

  const preset = bankByKey(institution);
  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);

  return (
    <form action={action} className="grid gap-0 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {card && <input type="hidden" name="id" value={card.id} />}

      {/* prévia + imagens */}
      <div className="grid content-start gap-5 border-b border-border bg-surface-2/60 p-5 sm:p-6 lg:border-b-0 lg:border-r">
        <BankCardFace
          card={{
            name: name || "Nome do cartão",
            institutionKey: institution,
            institutionName: null,
            brand,
            lastFour: lastFour.length === 4 ? lastFour : null,
            color,
            logoUrl: logo.removed ? null : logo.url,
            artUrl: art.removed ? null : art.url,
          }}
        />
        <ImagePicker
          name="logo"
          label="Logo da instituição"
          hint="PNG com fundo transparente fica melhor."
          state={logo}
          onChange={setLogo}
          hadImage={Boolean(card?.hasLogo)}
        />
        <ImagePicker
          name="art"
          label="Imagem do cartão"
          hint="Uma foto ou arte do seu cartão vira o fundo inteiro."
          state={art}
          onChange={setArt}
          hadImage={Boolean(card?.hasArt)}
        />
      </div>

      {/* dados */}
      <div className="grid content-start gap-5 p-5 sm:p-6">
        {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Instituição" htmlFor="institution_key">
            <Select
              id="institution_key"
              name="institution_key"
              value={institution}
              onChange={(e) => {
                setInstitution(e.target.value);
                setColor(bankByKey(e.target.value).color);
              }}
            >
              {BANKS.map((b) => (
                <option key={b.key} value={b.key}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Nome do cartão" htmlFor="name" error={errorFor("name")}>
            <Input id="name" name="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder={`Ex.: ${preset.key === "outro" ? "Cartão principal" : preset.name + " Platinum"}`} />
          </Field>
          <Field label="Bandeira" htmlFor="brand">
            <Select id="brand" name="brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              {CARD_BRANDS.map((b) => (
                <option key={b.key} value={b.key}>{b.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Final do cartão (opcional)" htmlFor="last_four" error={errorFor("last_four")}>
            <Input
              id="last_four"
              name="last_four"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000"
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </Field>
          <Field label="Limite" htmlFor="limit" error={errorFor("limit_cents")}>
            <Input id="limit" name="limit" inputMode="decimal" placeholder="0,00" defaultValue={card && card.limit > 0 ? formatBRL(card.limit).replace("R$ ", "") : ""} />
          </Field>
          <Field label="Conta que paga a fatura" htmlFor="payment_account_id">
            <Select id="payment_account_id" name="payment_account_id" defaultValue={card?.paymentAccountId ?? ""}>
              <option value="">{accounts.length ? "Escolher depois" : "Nenhuma conta cadastrada"}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Dia do fechamento" htmlFor="closing_day" error={errorFor("closing_day")}>
            <Input id="closing_day" name="closing_day" inputMode="numeric" required defaultValue={card?.closingDay ?? ""} placeholder="Ex.: 13" />
          </Field>
          <Field label="Dia do vencimento" htmlFor="due_day" error={errorFor("due_day")}>
            <Input id="due_day" name="due_day" inputMode="numeric" required defaultValue={card?.dueDay ?? ""} placeholder="Ex.: 20" />
          </Field>
        </div>

        <Field label="Compra feita no dia do fechamento" htmlFor="closing_day_rule">
          <Select id="closing_day_rule" name="closing_day_rule" defaultValue={card?.closingDayRule ?? "next_invoice"}>
            <option value="next_invoice">Vai para a próxima fatura (mais comum)</option>
            <option value="current_invoice">Entra na fatura que está fechando</option>
          </Select>
        </Field>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium text-ink-2">Cor do cartão</legend>
          <div className="flex flex-wrap items-center gap-2">
            {[preset.color, "#241127", "#C20F49", "#1F1F1F", "#0B2A5B", "#0E7A38"].filter((c, i, a) => a.indexOf(c) === i).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn("size-9 rounded-full border-2 transition-transform hover:scale-105", color.toUpperCase() === c.toUpperCase() ? "border-accent" : "border-transparent")}
                style={{ backgroundColor: c, boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)" }}
                aria-label={`Usar a cor ${c}`}
                aria-pressed={color.toUpperCase() === c.toUpperCase()}
              />
            ))}
            <label className="relative grid size-9 cursor-pointer place-items-center overflow-hidden rounded-full border border-border-strong text-xs text-ink-3" title="Outra cor">
              <span aria-hidden>+</span>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Escolher outra cor" />
            </label>
          </div>
          <input type="hidden" name="color" value={color} />
          <p className="text-sm text-ink-3">Usada quando o cartão não tem imagem.</p>
        </fieldset>

        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-3 border-t border-border bg-surface px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
          <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
          <Button type="submit" loading={pending}>{card ? "Salvar alterações" : "Adicionar cartão"}</Button>
        </div>
      </div>
    </form>
  );
}

interface ImageState {
  url: string | null;
  removed: boolean;
  error: string | null;
}

function ImagePicker({
  name,
  label,
  hint,
  state,
  onChange,
  hadImage,
}: {
  name: string;
  label: string;
  hint: string;
  state: ImageState;
  onChange: (s: ImageState) => void;
  hadImage: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const hasVisible = Boolean(state.url) && !state.removed;
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-ink-2">{label}</span>
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-[4.5rem] shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-surface">
          {hasVisible ? <img src={state.url!} alt="" className="h-full w-full object-contain" /> : <ImageUp className="size-5 text-ink-3" aria-hidden />}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            {hasVisible ? "Trocar" : "Enviar imagem"}
          </Button>
          {hasVisible && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                if (inputRef.current) inputRef.current.value = "";
                onChange({ url: state.url, removed: true, error: null });
              }}
              aria-label={`Remover ${label.toLowerCase()}`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > MAX) {
            e.target.value = "";
            onChange({ ...state, error: "A imagem pode ter no máximo 2 MB" });
            return;
          }
          onChange({ url: URL.createObjectURL(f), removed: false, error: null });
        }}
      />
      {hadImage && state.removed && <input type="hidden" name={`remove_${name}`} value="on" />}
      <p className={cn("text-xs", state.error ? "text-negative" : "text-ink-3")}>{state.error ?? hint}</p>
    </div>
  );
}
