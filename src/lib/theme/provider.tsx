"use client";
import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { saveTheme } from "./actions";
import type { Theme } from "./shared";

interface Ctx {
  theme: Theme;
  toggle: () => void;
}
const ThemeContext = React.createContext<Ctx | null>(null);

export function ThemeProvider({ initial, children }: { initial: Theme; children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>(initial);
  const toast = useToast();

  const apply = React.useCallback((next: Theme) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = next;
    window.setTimeout(() => root.classList.remove("theme-switching"), 450);
  }, []);

  const toggle = React.useCallback(() => {
    const previous = theme;
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    apply(next);
    saveTheme(next).then((r) => {
      if (!r.ok) {
        setTheme(previous);
        apply(previous);
        toast.show({ tone: "error", message: r.error });
      }
    }).catch(() => {
      setTheme(previous);
      apply(previous);
      toast.show({ tone: "error", message: "Sem conexão: o tema não foi salvo" });
    });
  }, [theme, apply, toast]);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme fora do ThemeProvider");
  return ctx;
}
