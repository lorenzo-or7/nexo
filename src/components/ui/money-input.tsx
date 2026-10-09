"use client";
import * as React from "react";
import { maskMoneyInput } from "@/domain/money";
import { cn } from "@/lib/cn";

/**
 * Campo de valor com casas decimais automáticas: digitar 5001 mostra 50,01.
 * Controlado (value/onValueChange) ou não controlado (defaultValue + name).
 */
export const MoneyInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (v: string) => void;
    allowNegative?: boolean;
    variant?: "field" | "bare";
  }
>(function MoneyInput({ value, defaultValue = "", onValueChange, allowNegative, className, variant = "field", ...props }, ref) {
  const [inner, setInner] = React.useState(() => maskMoneyInput(defaultValue, allowNegative));
  const current = value ?? inner;
  const innerRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current!);

  // o cursor fica sempre no fim: os dígitos entram pela direita
  const toEnd = () => {
    const el = innerRef.current;
    if (el) requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
  };

  return (
    <input
      ref={innerRef}
      inputMode="numeric"
      autoComplete="off"
      placeholder="0,00"
      {...props}
      value={current}
      onFocus={(e) => {
        toEnd();
        props.onFocus?.(e);
      }}
      onClick={toEnd}
      onChange={(e) => {
        const next = maskMoneyInput(e.target.value, allowNegative);
        if (value === undefined) setInner(next);
        onValueChange?.(next);
        toEnd();
      }}
      className={cn(
        "tabular",
        variant === "field" &&
          "h-12 w-full rounded-[var(--radius-control)] border border-border-strong bg-field px-4 text-base text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none aria-[invalid=true]:border-negative",
        className,
      )}
    />
  );
});
