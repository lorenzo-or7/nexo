"use client";
import { Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { removeCard, type CardActionResult } from "@/app/(app)/cartoes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

export function RemoveCardButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<CardActionResult, FormData>(removeCard, undefined);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      setOpen(false);
    }
  }, [state, toast]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={`Excluir ${name}`}>
          <Trash2 />
          Excluir
        </Button>
      </DialogTrigger>
      <DialogContent title={`Excluir ${name}?`} className="[--dialog-w:460px]">
        <form action={action} className="grid gap-5 p-5 sm:p-6">
          <input type="hidden" name="id" value={id} />
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <p className="text-ink-2">
            Se o cartão ainda não tem compras nem faturas, ele é apagado. Se já tem, ele é <strong className="font-semibold text-ink">arquivado</strong>: sai das telas, mas o histórico das suas compras continua certo.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="accent" loading={pending}>Excluir cartão</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
