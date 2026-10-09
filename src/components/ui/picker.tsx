"use client";
import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface PickerOption {
  value: string;
  label: string;
  /** agrupa as opções sob um título */
  group?: string;
  /** texto secundário à direita */
  hint?: string;
  /** bolinha de cor (ex.: cor da conta) */
  color?: string;
}

// o Radix não aceita "" como valor de item; usamos um sentinela interno
const NONE = "__none__";
const toInner = (v: string) => (v === "" ? NONE : v);
const toOuter = (v: string) => (v === NONE ? "" : v);

/**
 * Lista de opções com o visual do NEXO (substitui o <select> nativo).
 * Envia o valor no formulário por um input oculto com `name`.
 */
export function Picker({
  id,
  name,
  value,
  defaultValue = "",
  onValueChange,
  options,
  placeholder = "Escolher",
  variant = "field",
  className,
  invalid,
  disabled,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  options: PickerOption[];
  placeholder?: string;
  variant?: "field" | "pill";
  className?: string;
  invalid?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);

  // preserva a ordem dos grupos como vieram
  const groups: { title: string | null; items: PickerOption[] }[] = [];
  for (const o of options) {
    const title = o.group ?? null;
    const last = groups.at(-1);
    if (last && last.title === title) last.items.push(o);
    else groups.push({ title, items: [o] });
  }

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <S.Root
        value={toInner(current)}
        onValueChange={(v) => {
          // o Radix às vezes emite "" ao montar dentro de um formulário: não é escolha do usuário
          if (v === "") return;
          const outer = toOuter(v);
          if (value === undefined) setInner(outer);
          onValueChange?.(outer);
        }}
        disabled={disabled}
      >
        <S.Trigger
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={cn(
            "group flex w-full items-center gap-2.5 border border-border-strong bg-surface text-left text-ink outline-none transition-[border-color,box-shadow,background-color]",
            "hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--border-strong))]",
            "focus-visible:border-accent focus-visible:shadow-[0_0_0_4px_var(--accent-soft)] data-[state=open]:border-accent data-[state=open]:shadow-[0_0_0_4px_var(--accent-soft)]",
            "aria-[invalid=true]:border-negative disabled:opacity-50",
            variant === "field" ? "h-12 rounded-[var(--radius-control)] px-4 text-base" : "h-10 w-auto shrink-0 rounded-full px-4 text-sm",
            className,
          )}
        >
          {selected?.color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />}
          <span className={cn("min-w-0 flex-1 truncate", !selected && "text-ink-3")}>
            <S.Value placeholder={placeholder}>{selected ? selected.label : placeholder}</S.Value>
          </span>
          <S.Icon asChild>
            <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </S.Icon>
        </S.Trigger>
        <S.Portal>
          <S.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            className={cn(
              "z-[60] min-w-[var(--radix-select-trigger-width)] max-w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-border bg-surface text-ink",
              "shadow-[0_24px_60px_-20px_rgba(20,8,24,0.55),0_2px_6px_rgba(20,8,24,0.08)]",
              "data-[state=open]:animate-[pop-in_140ms_ease-out]",
            )}
          >
            <S.ScrollUpButton className="flex h-7 items-center justify-center text-ink-3">
              <ChevronDown className="size-4 rotate-180" />
            </S.ScrollUpButton>
            <S.Viewport className="max-h-[min(360px,var(--radix-select-content-available-height))] p-1.5">
              {groups.map((g, gi) =>
                g.title ? (
                  <S.Group key={`${g.title}-${gi}`} className={cn(gi > 0 && "mt-1 border-t border-border pt-1")}>
                    <S.Label className="px-3 pb-1 pt-2 text-xs font-semibold text-ink-3">{g.title}</S.Label>
                    {g.items.map((o) => <Item key={o.value} option={o} />)}
                  </S.Group>
                ) : (
                  <React.Fragment key={`none-${gi}`}>
                    {g.items.map((o) => <Item key={o.value} option={o} />)}
                  </React.Fragment>
                ),
              )}
            </S.Viewport>
            <S.ScrollDownButton className="flex h-7 items-center justify-center text-ink-3">
              <ChevronDown className="size-4" />
            </S.ScrollDownButton>
          </S.Content>
        </S.Portal>
      </S.Root>
    </>
  );
}

function Item({ option }: { option: PickerOption }) {
  return (
    <S.Item
      value={toInner(option.value)}
      className={cn(
        "relative flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl py-2 pl-3 pr-9 text-[0.9375rem] outline-none",
        "data-[highlighted]:bg-surface-2 data-[state=checked]:font-medium data-[state=checked]:text-accent",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      )}
    >
      {option.color && <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} />}
      <S.ItemText>{option.label}</S.ItemText>
      {option.hint && <span className="ml-auto pl-3 text-xs font-normal text-ink-3">{option.hint}</span>}
      <S.ItemIndicator className="absolute right-3 inline-flex">
        <Check className="size-4" />
      </S.ItemIndicator>
    </S.Item>
  );
}
