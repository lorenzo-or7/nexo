"use client";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Tags, X } from "lucide-react";
import { categoryColor, categoryTree } from "@/domain/categories";
import { addMonthRef } from "@/domain/dates";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Picker } from "@/components/ui/picker";
import type { AccountOption, CategoryOption } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";

/** Filtros na URL (dá para voltar, recarregar e compartilhar o link). */
export function EntriesFilters({ accounts, categories, today }: { accounts: AccountOption[]; categories: CategoryOption[]; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "categoria") next.delete("sem_sub"); // trocar a categoria desfaz o recorte "sem subcategoria"
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set("q", q.trim());
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["mes", "conta", "tipo", "categoria", "sem_sub", "q"].some((k) => sp.get(k));
  const month = sp.get("mes") ?? "";
  // de 2 meses à frente até 3 anos atrás (inclui o mês escolhido se estiver fora)
  const monthOptions = Array.from({ length: 39 }, (_, i) => addMonthRef(today.slice(0, 7), 2 - i));
  if (month && !monthOptions.includes(month)) monthOptions.push(month);
  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    const name = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][mm - 1];
    return `${name} de ${y}`;
  };

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
          className="h-11 w-full rounded-full border border-border-strong bg-field/70 pl-11 pr-4 text-[0.9375rem] text-ink placeholder:text-ink-3 transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none"
        />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <div className="flex shrink-0 items-center gap-1">
          {month && (
            <button type="button" onClick={() => set("mes", addMonthRef(month, -1))} aria-label="Mês anterior" className="grid size-10 place-items-center rounded-full border border-border-strong bg-field text-ink-2 hover:border-accent hover:text-ink">
              <ChevronLeft className="size-4" />
            </button>
          )}
          <Picker
            aria-label="Mês"
            variant="pill"
            value={month}
            onValueChange={(v) => set("mes", v)}
            options={[{ value: "", label: "Todos os meses" }, ...monthOptions.sort().reverse().map((m) => ({ value: m, label: monthLabel(m), group: m.slice(0, 4) }))]}
            className={cn(month && "border-accent/60 text-ink")}
          />
          {month && (
            <button type="button" onClick={() => set("mes", addMonthRef(month, 1))} aria-label="Próximo mês" className="grid size-10 place-items-center rounded-full border border-border-strong bg-field text-ink-2 hover:border-accent hover:text-ink">
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
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
            { value: "none", label: "Sem categoria" },
            ...(["expense", "income"] as const).flatMap((k) =>
              categoryTree(categories, k).flatMap(({ parent, children }) => [
                { value: parent.id, label: `${parent.name} (tudo)`, group: `${parent.name} · ${k === "expense" ? "despesa" : "receita"}`, color: categoryColor(parent, categories) },
                ...children.map((c) => ({ value: c.id, label: c.name, group: `${parent.name} · ${k === "expense" ? "despesa" : "receita"}`, color: categoryColor(c, categories) })),
              ]),
            ),
          ]}
        />
        <Link
          href="/categorias"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-3.5 text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
        >
          <Tags className="size-4" />
          Categorias
        </Link>
        {sp.get("sem_sub") === "1" && (
          <button
            type="button"
            onClick={() => set("sem_sub", "")}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-accent px-3.5 text-sm text-ink"
            aria-label="Remover filtro: sem subcategoria"
          >
            Sem subcategoria
            <X className="size-4" />
          </button>
        )}
        {active && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              const next = new URLSearchParams();
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
