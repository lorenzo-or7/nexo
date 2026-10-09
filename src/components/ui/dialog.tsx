"use client";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/** Painel modal: folha inferior no celular, janela centralizada no desktop. */
export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[rgb(20_8_24/0.55)] backdrop-blur-[2px] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] flex-col overflow-hidden border border-border bg-surface text-ink shadow-[0_30px_80px_-30px_rgba(20,8,24,0.7)] focus:outline-none",
          "inset-x-0 bottom-0 rounded-t-[1.5rem] pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-[sheet-up_220ms_cubic-bezier(.2,.8,.2,1)]",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,var(--dialog-w,560px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[1.5rem] sm:data-[state=open]:animate-[pop-in_180ms_ease-out]",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-sm text-ink-3">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="grid size-9 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Fechar">
            <X className="size-[18px]" />
          </D.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}
