"use client";
import { Check, RotateCcw, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { removeCategory, restoreCategory, saveCategory, type CategoryActionResult } from "@/app/(app)/categorias/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_COLORS, categoryColor, type CategoryKind, type CategoryNode } from "@/domain/categories";
import { cn } from "@/lib/cn";

function useDone(state: CategoryActionResult, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export const KIND_LABEL: Record<CategoryKind, string> = { expense: "Despesa", income: "Receita" };

/** Alternador Despesa/Receita no visual dos filtros. */
export function KindSwitch({ value, onChange, disabled, name }: { value: CategoryKind; onChange: (k: CategoryKind) => void; disabled?: boolean; name?: string }) {
  return (
    <div role="radiogroup" aria-label="Tipo" className={cn("grid h-12 grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border-strong bg-field p-1", disabled && "opacity-60")}>
      {name && <input type="hidden" name={name} value={value} />}
      {(["expense", "income"] as const).map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          disabled={disabled}
          onClick={() => onChange(k)}
          className={cn("rounded-[0.6rem] text-sm font-medium transition-colors", value === k ? "btn-glow" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
        >
          {KIND_LABEL[k]}
        </button>
      ))}
    </div>
  );
}

export function ColorSwatches({ value, onChange, auto }: { value: string; onChange: (c: string) => void; auto: string }) {
  const swatch = "relative grid size-8 place-items-center rounded-full transition-transform hover:scale-110";
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Cor">
      <button type="button" role="radio" aria-checked={value === ""} onClick={() => onChange("")} title="Automática" aria-label="Cor automática" className={cn(swatch, "border border-dashed border-border-strong")} style={{ background: `color-mix(in oklab, ${auto} 30%, transparent)` }}>
        {value === "" && <Check className="size-4 text-ink" />}
      </button>
      {CATEGORY_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toUpperCase() === c} aria-label={`Cor ${c}`} onClick={() => onChange(c)} className={swatch} style={{ background: c }}>
          {value.toUpperCase() === c && <Check className="size-4 text-white drop-shadow" />}
        </button>
      ))}
    </div>
  );
}

export interface EditorTarget {
  category?: CategoryNode;
  /** nova subcategoria dentro desta principal */
  parentId?: string | null;
  kind?: CategoryKind;
}

export function CategoryEditor({
  target,
  all,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  target: EditorTarget;
  all: CategoryNode[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const c = target.category;
  const title = c ? `Editar ${c.parentId ? "subcategoria" : "categoria"}` : target.parentId ? "Nova subcategoria" : "Nova categoria";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent title={title} description="Categorias organizam seus lançamentos e viram filtros na tela de Lançamentos." className="[--dialog-w:520px]">
        {open && <CategoryForm target={target} all={all} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ target, all, onDone }: { target: EditorTarget; all: CategoryNode[]; onDone: () => void }) {
  const [state, action, pending] = useActionState<CategoryActionResult, FormData>(saveCategory, undefined);
  useDone(state, onDone);
  const c = target.category;
  const [kind, setKind] = useState<CategoryKind>(c?.kind ?? target.kind ?? "expense");
  const [parentId, setParentId] = useState<string>(c ? (c.parentId ?? "") : (target.parentId ?? ""));
  const [color, setColor] = useState(c?.color ?? "");
  const [name, setName] = useState(c?.name ?? "");
  const hasChildren = Boolean(c && all.some((x) => x.parentId === c.id));
  const parents = all.filter((p) => !p.parentId && p.kind === kind && p.id !== c?.id);
  const errorFor = (f: string) => (state && !state.ok && state.field === f ? state.error : undefined);
  const parent = all.find((p) => p.id === parentId);
  const preview: CategoryNode = { id: c?.id ?? "new", name: name || "Nova", parentId: parentId || null, kind, color: color || null };

  return (
    <form action={action} className="grid gap-5 p-5 sm:p-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="color" value={color} />
      {state && !state.ok && !state.field && <FormMessage tone="error">{state.error}</FormMessage>}

      <Field label="Nome" htmlFor="cat-name" error={errorFor("name")}>
        <Input id="cat-name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required autoFocus placeholder="Ex.: Pets, Viagens, Cartas Pokémon" aria-invalid={Boolean(errorFor("name")) || undefined} />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Tipo" htmlFor="cat-kind">
          <KindSwitch
            name="kind"
            value={parent ? parent.kind : kind}
            disabled={Boolean(parent)}
            onChange={(k) => {
              setKind(k);
              setParentId("");
            }}
          />
        </Field>
        <Field label="Fica dentro de" htmlFor="parent_id" error={errorFor("parent_id")}>
          <Picker
            id="parent_id"
            name="parent_id"
            value={parentId}
            onValueChange={setParentId}
            disabled={hasChildren}
            options={[
              { value: "", label: "Nenhuma (é principal)" },
              ...parents.map((p) => ({ value: p.id, label: p.name, color: categoryColor(p, all) })),
            ]}
          />
        </Field>
      </div>
      {hasChildren && <p className="-mt-3 text-sm text-ink-3">Tem subcategorias, então continua como principal.</p>}

      <Field label={parent ? "Cor (vazio = a da principal)" : "Cor"} htmlFor="cat-color">
        <ColorSwatches value={color} onChange={setColor} auto={categoryColor({ ...preview, color: null }, all)} />
      </Field>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/60 px-4 py-3">
        <span className="size-3 shrink-0 rounded-full shadow-[0_0_10px_currentColor]" style={{ background: categoryColor(preview, all), color: categoryColor(preview, all) }} />
        <span className="min-w-0 truncate text-sm">
          {parent && <span className="text-ink-3">{parent.name} › </span>}
          <span className="font-medium">{name.trim() || "Nova categoria"}</span>
        </span>
        <span className="ml-auto text-xs text-ink-3">{KIND_LABEL[parent ? parent.kind : kind]}</span>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
        <Button type="submit" loading={pending}>{c ? "Salvar alterações" : "Criar categoria"}</Button>
      </div>
    </form>
  );
}

export function RemoveCategoryButton({ category, childCount }: { category: CategoryNode; childCount: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CategoryActionResult, FormData>(removeCategory, undefined);
  useDone(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" aria-label={`Excluir ${category.name}`} className="grid size-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-accent-soft hover:text-negative">
          <Trash2 className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent title={`Excluir ${category.name}?`} className="[--dialog-w:460px]">
        <form action={action} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={category.id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            Sem lançamentos, ela é apagada. Com lançamentos, é <strong className="font-semibold text-ink">arquivada</strong>: some das opções, mas o histórico continua com o nome certo.
            {childCount > 0 && <> As {childCount} subcategorias vão junto.</>}
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="accent" loading={pending}>Excluir</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RestoreCategoryButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<CategoryActionResult, FormData>(restoreCategory, undefined);
  useDone(state, () => {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" loading={pending} aria-label={`Restaurar ${name}`}>
        <RotateCcw />
        Restaurar
      </Button>
      {state && !state.ok && <span className="ml-2 text-sm text-negative">{state.error}</span>}
    </form>
  );
}
