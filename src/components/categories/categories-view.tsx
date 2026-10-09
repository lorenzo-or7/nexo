"use client";
import Link from "next/link";
import { Archive, ChevronDown, ListFilter, Pencil, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { categoryColor, categoryTree, type CategoryKind } from "@/domain/categories";
import type { CategoryItem } from "@/lib/data/categories";
import { cn } from "@/lib/cn";
import { CategoryEditor, KIND_LABEL, RemoveCategoryButton, RestoreCategoryButton, type EditorTarget } from "./category-dialogs";

export function CategoriesView({ categories, openNew }: { categories: CategoryItem[]; openNew?: boolean }) {
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<EditorTarget | null>(openNew ? { kind: "expense" } : null);
  const active = categories.filter((c) => !c.archived);
  const archived = categories.filter((c) => c.archived);
  const groups = categoryTree(active, kind);
  const count = (k: CategoryKind) => active.filter((c) => c.kind === k).length;

  return (
    <>
      <PageHeader
        title="Categorias"
        subtitle="Crie as suas e filtre os lançamentos do seu jeito."
        actions={
          <Button onClick={() => setEditing({ kind })}>
            <Plus />
            Nova categoria
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tipo de categoria" className="panel-quiet inline-flex gap-1 rounded-full p-1">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={cn("h-9 rounded-full px-4 text-sm font-medium transition-colors", kind === k ? "btn-glow" : "text-ink-2 hover:text-ink")}
            >
              {k === "expense" ? "Despesas" : "Receitas"}
              <span className={cn("ml-1.5 tabular text-xs", kind === k ? "opacity-80" : "text-ink-3")}>{count(k)}</span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <Panel className="grid max-w-xl justify-items-start gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent"><Tags className="size-6" /></span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Nenhuma categoria de {KIND_LABEL[kind].toLowerCase()}</h2>
            <p className="mt-1 text-ink-2">Crie uma categoria principal e, dentro dela, subcategorias para detalhar.</p>
          </div>
          <Button onClick={() => setEditing({ kind })}><Plus />Nova categoria</Button>
        </Panel>
      ) : (
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {groups.map(({ parent, children }) => {
            const color = categoryColor(parent, categories);
            return (
              <li key={parent.id} className="min-w-0">
                <Panel className="relative flex h-full flex-col gap-4 overflow-hidden p-5" data-testid="category-group">
                  <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-25 blur-2xl" style={{ background: color }} />
                  <div className="relative flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 55%, black))` }}>
                      {parent.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold">{parent.name}</h2>
                      <p className="text-sm text-ink-3">{children.length === 0 ? "Sem subcategorias" : `${children.length} subcategoria${children.length > 1 ? "s" : ""}`}</p>
                    </div>
                    <Link href={`/lancamentos?categoria=${parent.id}`} aria-label={`Ver lançamentos de ${parent.name}`} title="Ver lançamentos" className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                      <ListFilter className="size-4" />
                    </Link>
                    <button type="button" aria-label={`Editar ${parent.name}`} onClick={() => setEditing({ category: parent })} className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
                      <Pencil className="size-4" />
                    </button>
                    <RemoveCategoryButton category={parent} childCount={children.length} />
                  </div>

                  <ul className="relative flex flex-wrap gap-2">
                    {children.map((c) => {
                      const cc = categoryColor(c, categories);
                      return (
                        <li key={c.id}>
                          <span className="group inline-flex h-8 items-center rounded-full border border-border bg-surface-2/70 pl-3 text-sm transition-colors hover:border-[color-mix(in_oklab,var(--accent)_45%,var(--border))]">
                            <span className="mr-2 size-2 rounded-full" style={{ background: cc }} />
                            <button type="button" onClick={() => setEditing({ category: c })} className="max-w-[14rem] truncate pr-1" aria-label={`Editar ${c.name}`}>
                              {c.name}
                            </button>
                            <span className="pr-1 [&_button]:size-7">
                              <RemoveCategoryButton category={c} childCount={0} />
                            </span>
                          </span>
                        </li>
                      );
                    })}
                    <li>
                      <button
                        type="button"
                        onClick={() => setEditing({ parentId: parent.id, kind: parent.kind })}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-border-strong px-3 text-sm text-ink-2 transition-colors hover:border-accent hover:text-accent"
                      >
                        <Plus className="size-3.5" />
                        Subcategoria
                      </button>
                    </li>
                  </ul>
                </Panel>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="group mt-8 max-w-3xl">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-2 hover:text-ink">
            <Archive className="size-4" />
            Arquivadas ({archived.length})
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="panel-quiet mt-3 divide-y divide-border rounded-2xl">
            {archived.map((c) => {
              const parent = c.parentId ? categories.find((p) => p.id === c.parentId) : null;
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="size-2 shrink-0 rounded-full" style={{ background: categoryColor(c, categories) }} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {parent && <span className="text-ink-3">{parent.name} › </span>}
                    {c.name}
                    <span className="ml-2 text-xs text-ink-3">{KIND_LABEL[c.kind]}</span>
                  </span>
                  <RestoreCategoryButton id={c.id} name={c.name} />
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <CategoryEditor
        key={editing ? JSON.stringify(editing.category?.id ?? editing) : "closed"}
        target={editing ?? {}}
        all={active}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </>
  );
}
