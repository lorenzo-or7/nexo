"use client";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Lê/grava uma preferência de tela; o armazenamento do navegador pode falhar, então tudo é protegido. */
export function usePref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = window.localStorage.getItem(`nexo:${key}`);
      return v && (allowed as readonly string[]).includes(v) ? (v as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(`nexo:${key}`, v);
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  };
  return [value, set];
}

/**
 * Igual ao usePref, mas seguro para componentes que também são renderizados no servidor:
 * começa com o valor padrão (igual no servidor e no navegador) e só depois lê a escolha guardada.
 */
export function useStoredPref<T extends string>(key: string, initial: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(`nexo:${key}`);
      if (v && (allowed as readonly string[]).includes(v)) setValue(v as T);
    } catch {
      /* sem armazenamento: fica no padrão */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (v: T) => {
    setValue(v);
    try {
      window.localStorage.setItem(`nexo:${key}`, v);
    } catch {
      /* sem armazenamento: só não lembra a escolha */
    }
  };
  return [value, set];
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  /** `short`: rótulo curto usado só em telas estreitas */
  options: { key: T; label: string; short?: string; icon?: ReactNode }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full overflow-x-auto rounded-full border border-border bg-field/60 p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 text-[0.8125rem] transition-colors sm:px-3 sm:text-sm",
            value === o.key ? "btn-primary" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.icon}
          {o.short ? (
            <>
              <span className="sm:hidden">{o.short}</span>
              <span className="hidden sm:inline">{o.label}</span>
            </>
          ) : (
            o.label
          )}
        </button>
      ))}
    </div>
  );
}

