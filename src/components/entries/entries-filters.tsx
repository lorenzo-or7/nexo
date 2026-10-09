"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Picker } from "@/components/ui/picker";
import type { AccountOption, CategoryOption } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";

/** Filtros na URL (dá para voltar, recarregar e compartilhar o link). */
export function EntriesFilters({ accounts, categories }: { accounts: AccountOption[]; categories: CategoryOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set("q", q.trim());
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["conta", "tipo", "categoria", "q"].some((k) => sp.get(k));

  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-3 transition-opacity", pending && "opacity-60")}>
      <label className="relative block">
        <span className="sr-only">Buscar lançamentos</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por descrição ou observação"
          className="h-11 w-full rounded-full border border-border-strong bg-surface pl-11 pr-4 text-[0.9375rem] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Picker
          aria-label="Tipo"
          variant="pill"
          value={sp.get("tipo") ?? ""}
          onValueChange={(v) => set("tipo", v)}
          options={[
            { value: "", label: "Todos os tipos" },
            { value: "expense", label: "Despesas" },
            { value: "income", label: "Receitas e reembolsos" },
            { value: "transfer", label: "Transferências" },
            { value: "pending", label: "Pendentes" },
          ]}
        />
        <Picker
          aria-label="Conta"
          variant="pill"
          value={sp.get("conta") ?? ""}
          onValueChange={(v) => set("conta", v)}
          options={[{ value: "", label: "Todas as contas" }, ...accounts.map((a) => ({ value: a.id, label: a.name, color: a.color }))]}
        />
        <Picker
          aria-label="Categoria"
          variant="pill"
          value={sp.get("categoria") ?? ""}
          onValueChange={(v) => set("categoria", v)}
          options={[
            { value: "", label: "Todas as categorias" },
            ...categories.filter((c) => !c.parentId).flatMap((p) => [
              { value: p.id, label: `${p.name} (geral)`, group: p.name },
              ...categories.filter((c) => c.parentId === p.id).map((c) => ({ value: c.id, label: c.name, group: p.name })),
            ]),
          ]}
        />
        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              const next = new URLSearchParams();
              if (sp.get("mes")) next.set("mes", sp.get("mes")!);
              start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
            }}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
