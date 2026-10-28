"use client";
import * as Popover from "@radix-ui/react-popover";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { PALETTES } from "@/lib/theme/palettes";
import { useTheme } from "@/lib/theme/provider";
import type { Theme } from "@/lib/theme/shared";

const MODES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
];

/**
 * Seletor compacto de aparência da landing: um único botão que abre modo (claro/escuro) e paleta.
 * Aplica na hora e guarda no navegador (cookie); se a pessoa já tiver conta, a conta é quem manda
 * depois do login, então nada salvo é sobrescrito.
 */
export function ThemePicker({ className }: { className?: string }) {
  const { theme, palette, setTheme, setPalette } = useTheme();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Aparência: modo e cores"
          className={cn("grid size-10 shrink-0 place-items-center rounded-full border border-border-strong bg-field/60 text-ink-2 transition-colors hover:text-ink", className)}
        >
          <Palette className="size-[18px]" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="panel z-50 w-[min(20rem,calc(100vw-1.5rem))] p-4 text-ink shadow-[0_24px_60px_-24px_rgba(20,8,24,0.8)] focus:outline-none data-[state=open]:animate-[pop-in_160ms_ease-out]"
        >
          <p id="tp-mode" className="text-xs font-medium uppercase tracking-wide text-ink-3">Modo</p>
          <div role="radiogroup" aria-labelledby="tp-mode" className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-field/60 p-1">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={theme === id}
                onClick={() => setTheme(id)}
                className={cn("inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors", theme === id ? "bg-surface-3 text-ink shadow-sm" : "text-ink-3 hover:text-ink")}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          <p id="tp-palette" className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-3">Cores</p>
          <div role="radiogroup" aria-labelledby="tp-palette" className="mt-2 grid grid-cols-3 gap-2">
            {PALETTES.map((p) => {
              const active = palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={p.name}
                  onClick={() => setPalette(p.id)}
                  className={cn(
                    "relative grid min-h-[4.25rem] gap-1.5 rounded-xl border p-2 text-left text-xs font-medium transition-colors",
                    active ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border-strong hover:border-accent/60",
                  )}
                >
                  <span className="flex h-8 overflow-hidden rounded-lg border border-border" aria-hidden>
                    <span className="flex-1" style={{ background: theme === "dark" ? p.base : p.themeColor.light }} />
                    <span className="w-1/3" style={{ background: p.accent }} />
                  </span>
                  <span className="flex items-center justify-between gap-1">
                    <span className="truncate">{p.name}</span>
                    {active && <Check className="size-3.5 shrink-0 text-accent" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
