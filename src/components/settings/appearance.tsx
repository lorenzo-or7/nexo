"use client";
import Image from "next/image";
import { Check, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/cn";
import { brandAssets, PALETTES } from "@/lib/theme/palettes";
import { useTheme } from "@/lib/theme/provider";
import type { Theme } from "@/lib/theme/shared";

const MODES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
];

/** Escolha do modo (claro/escuro) e da paleta de cores; a logo acompanha a escolha. */
export function AppearanceForm() {
  const { theme, palette, setTheme, setPalette } = useTheme();
  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p id="mode-label" className="text-sm font-medium text-ink-2">Modo</p>
        <div role="radiogroup" aria-labelledby="mode-label" className="inline-grid w-full max-w-xs grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-field/60 p-1">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={theme === id}
              onClick={() => setTheme(id)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-4px)] text-[0.9375rem] font-medium transition-colors",
                theme === id ? "bg-surface-3 text-ink shadow-sm" : "text-ink-3 hover:text-ink",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <p id="palette-label" className="text-sm font-medium text-ink-2">Paleta de cores</p>
        <div role="radiogroup" aria-labelledby="palette-label" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PALETTES.map((p) => {
            const active = palette === p.id;
            // a amostra mostra o modo atual para a pessoa ver exatamente o que vai receber
            const mark = brandAssets(p.id, theme).mark;
            const dark = theme === "dark";
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPalette(p.id)}
                className={cn(
                  "group relative grid gap-3 rounded-2xl border p-3 text-left transition-[border-color,box-shadow,transform] hover:-translate-y-0.5",
                  active ? "border-accent shadow-[0_0_0_1px_var(--accent)]" : "border-border-strong hover:border-accent/60",
                )}
              >
                <span
                  className="grid h-24 place-items-center rounded-xl"
                  style={{ background: dark ? p.base : p.themeColor.light }}
                >
                  <Image src={mark} alt="" width={64} height={52} className="h-14 w-auto object-contain" />
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="flex -space-x-1.5" aria-hidden>
                    <span className="size-5 rounded-full border border-border-strong" style={{ background: p.base }} />
                    <span className="size-5 rounded-full border border-border-strong" style={{ background: p.accent }} />
                  </span>
                </span>
                {active && (
                  <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-accent-ink shadow">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-ink-3">Vale para o site todo, em todos os seus aparelhos. A logo muda junto com a paleta.</p>
      </div>
    </div>
  );
}
