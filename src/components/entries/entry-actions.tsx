"use client";
import { Check, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { confirmEntry, deleteEntry, type EntryActionResult } from "@/app/(app)/lancamentos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

function useResult(state: EntryActionResult, after?: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.show({ tone: "success", message: state.message });
      after?.();
    } else toast.show({ tone: "error", message: state.error });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function ConfirmEntryButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<EntryActionResult, FormData>(confirmEntry, undefined);
  useResult(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="outline" loading={pending} title="Marcar como realizado">
        <Check />
        <span className="max-sm:sr-only">Realizado</span>
      </Button>
    </form>
  );
}

export function DeleteEntryButton({ id, label, isTransfer }: { id: string; label: string; isTransfer: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EntryActionResult, FormData>(deleteEntry, undefined);
  useResult(state, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={`Excluir ${label}`} title="Excluir">
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent title="Excluir lançamento?" className="[--dialog-w:440px]">
        <form action={action} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            <strong className="font-semibold text-ink">{label}</strong> sai do saldo e dos relatórios.
            {isTransfer ? " Os dois lados da transferência são excluídos juntos." : ""} A exclusão fica registrada no histórico de alterações.
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
