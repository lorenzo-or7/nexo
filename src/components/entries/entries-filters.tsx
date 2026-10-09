"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Select } from "@/components/ui/field";
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
  const selectCls = "h-10 rounded-full px-4 text-sm";

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
        <Select aria-label="Tipo" value={sp.get("tipo") ?? ""} onChange={(e) => set("tipo", e.target.value)} className={cn(selectCls, "w-auto shrink-0")}>
          <option value="">Todos os tipos</option>
          <option value="expense">Despesas</option>
          <option value="income">Receitas e reembolsos</option>
          <option value="transfer">Transferências</option>
          <option value="pending">Pendentes</option>
        </Select>
        <Select aria-label="Conta" value={sp.get("conta") ?? ""} onChange={(e) => set("conta", e.target.value)} className={cn(selectCls, "w-auto shrink-0")}>
          <option value="">Todas as contas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select aria-label="Categoria" value={sp.get("categoria") ?? ""} onChange={(e) => set("categoria", e.target.value)} className={cn(selectCls, "w-auto shrink-0")}>
          <option value="">Todas as categorias</option>
          {categories.filter((c) => !c.parentId).map((p) => (
            <optgroup key={p.id} label={p.name}>
              <option value={p.id}>{p.name} (geral)</option>
              {categories.filter((c) => c.parentId === p.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </Select>
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
