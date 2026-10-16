"use client";
import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { savePalette, saveTheme } from "./actions";
import type { PaletteId } from "./palettes";
import type { Theme } from "./shared";

interface Ctx {
  theme: Theme;
  palette: PaletteId;
  toggle: () => void;
  setTheme: (next: Theme) => void;
  setPalette: (next: PaletteId) => void;
}
const ThemeContext = React.createContext<Ctx | null>(null);

export function ThemeProvider({ initial, initialPalette, children }: { initial: Theme; initialPalette: PaletteId; children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(initial);
  const [palette, setPaletteState] = React.useState<PaletteId>(initialPalette);
  const toast = useToast();

  const applyAttr = React.useCallback((name: "theme" | "palette", value: string) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset[name] = value;
    window.setTimeout(() => root.classList.remove("theme-switching"), 450);
  }, []);

  const setTheme = React.useCallback(
    (next: Theme) => {
      if (next === theme) return;
      const previous = theme;
      setThemeState(next);
      applyAttr("theme", next);
      const rollback = (message: string) => {
        setThemeState(previous);
        applyAttr("theme", previous);
        toast.show({ tone: "error", message });
      };
      saveTheme(next)
        .then((r) => {
          if (!r.ok) rollback(r.error);
        })
        .catch(() => rollback("Sem conexão: o tema não foi salvo"));
    },
    [theme, applyAttr, toast],
  );

  const setPalette = React.useCallback(
    (next: PaletteId) => {
      if (next === palette) return;
      const previous = palette;
      setPaletteState(next);
      applyAttr("palette", next);
      const rollback = (message: string) => {
        setPaletteState(previous);
        applyAttr("palette", previous);
        toast.show({ tone: "error", message });
      };
      savePalette(next)
        .then((r) => {
          if (!r.ok) rollback(r.error);
        })
        .catch(() => rollback("Sem conexão: a paleta não foi salva"));
    },
    [palette, applyAttr, toast],
  );

  const toggle = React.useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, palette, toggle, setTheme, setPalette }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme fora do ThemeProvider");
  return ctx;
}
