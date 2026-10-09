"use client";
import { Plus } from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { EntryRow, QuickEntryData } from "@/lib/data/ledger";
import { cn } from "@/lib/cn";
import { EntryForm } from "./entry-form";

export function EntryDialog({
  data,
  initial,
  defaultAccountId,
  trigger,
}: {
  data: QuickEntryData;
  initial?: EntryRow;
  defaultAccountId?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={initial ? "Editar lançamento" : "Novo lançamento"} className="[--dialog-w:600px]">
        {open && <EntryForm data={data} initial={initial} defaultAccountId={defaultAccountId} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Botão global: na barra lateral (desktop) ou flutuante (celular). */
export function QuickEntryButton({ data, variant }: { data: QuickEntryData; variant: "sidebar" | "fab" }) {
  if (variant === "sidebar") {
    return (
        <EntryDialog
          data={data}
          trigger={
            <button className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[0.9375rem] font-medium text-primary-ink shadow-[0_8px_20px_-10px_var(--primary)] transition hover:brightness-110 active:scale-[0.98]">
              <Plus className="size-[18px]" />
              Novo lançamento
            </button>
          }
        />
    );
  }
  return (
      <div className="lg:hidden">
        <EntryDialog
          data={data}
          trigger={
            <button
              aria-label="Novo lançamento"
              className={cn(
                "fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 grid size-14 place-items-center rounded-full",
                "bg-crimson text-white shadow-[0_12px_28px_-8px_rgba(194,15,73,0.7)] transition active:scale-95",
              )}
            >
              <Plus className="size-6" strokeWidth={2.4} />
            </button>
          }
        />
      </div>
  );
}
