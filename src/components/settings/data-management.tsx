"use client";
import { AlertTriangle, Download, Eraser, FileSpreadsheet, ShieldCheck, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { clearAllData, clearEntries, type DataActionResult } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CLEAR_ALL_PHRASE, CLEAR_ENTRIES_PHRASE } from "@/lib/data-management";

function ExportLinks({ className }: { className?: string }) {
  return (
    <div className={className ?? "flex flex-wrap gap-3"}>
      <Button asChild variant="outline">
        <a href="/api/export" download><Download />Exportar tudo (JSON)</a>
      </Button>
      <Button asChild variant="outline">
        <a href="/api/export?formato=csv" download><FileSpreadsheet />Lançamentos (CSV)</a>
      </Button>
    </div>
  );
}

function Lists({ deleted, kept }: { deleted: string[]; kept: string[] }) {
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-2xl border border-border p-3">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-negative"><Trash2 className="size-4" />Será apagado</p>
        <ul className="grid gap-1 text-ink-2">{deleted.map((d) => <li key={d}>• {d}</li>)}</ul>
      </div>
      <div className="rounded-2xl border border-border p-3">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-positive"><ShieldCheck className="size-4" />Continua com você</p>
        <ul className="grid gap-1 text-ink-2">{kept.map((d) => <li key={d}>• {d}</li>)}</ul>
      </div>
    </div>
  );
}

function ClearEntries() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DataActionResult, FormData>(clearEntries, undefined);
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) {
      toast.show({ tone: "success", message: state.message });
      setOpen(false);
      setTyped("");
    }
  }, [state, toast]);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-auto min-h-11 whitespace-normal py-2.5 text-center"><Eraser />Limpar meus lançamentos</Button>
      </DialogTrigger>
      <DialogContent title="Limpar meus lançamentos?" description="Recomeçar o histórico sem perder sua estrutura." className="[--dialog-w:560px]">
        <form action={action} className="grid gap-4 overflow-y-auto p-5 sm:p-6">
          {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
          <Lists
            deleted={["Receitas e despesas lançadas", "Transferências", "Compras no cartão e parcelas", "Pagamentos de fatura", "Histórico de cobranças de assinaturas"]}
            kept={["Contas e cartões", "Categorias e subcategorias", "Assinaturas, contas fixas e rendas fixas", "Metas e orçamentos", "Login e preferências"]}
          />
          <p className="text-sm text-ink-3">
            O saldo de cada conta volta ao saldo inicial. Assinaturas e rendas fixas continuam valendo daqui para a frente, mas <strong className="font-semibold text-ink-2">não recriam</strong> o que já passou.
            Não dá para desfazer; exporte antes se quiser guardar uma cópia.
          </p>
          <ExportLinks />
          <Field label={`Para confirmar, digite ${CLEAR_ENTRIES_PHRASE}`} htmlFor="clear-entries-confirm">
            <Input id="clear-entries-confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="danger" loading={pending} disabled={typed !== CLEAR_ENTRIES_PHRASE}>Limpar lançamentos</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClearAll() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DataActionResult, FormData>(clearAllData, undefined);
  const reset = () => { setStep(1); setTyped(""); };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="danger" className="h-auto min-h-11 whitespace-normal py-2.5 text-center"><AlertTriangle />Limpar todos os meus dados financeiros</Button>
      </DialogTrigger>
      <DialogContent
        title={step === 1 ? "Limpar todos os dados financeiros?" : step === 2 ? "Quer guardar uma cópia antes?" : "Confirmação final"}
        description={`Etapa ${step} de 3`}
        className="[--dialog-w:580px]"
      >
        {step === 1 && (
          <div className="grid gap-4 overflow-y-auto p-5 sm:p-6" data-testid="wipe-step-1">
            <FormMessage tone="error">Esta ação é permanente e não pode ser desfeita.</FormMessage>
            <Lists
              deleted={["Contas e cartões", "Faturas, compras e parcelas", "Receitas e despesas", "Rendas fixas, contas fixas e assinaturas", "Metas, orçamentos e histórico", "Categorias e subcategorias criadas por você"]}
              kept={["Seu login, e-mail e senha", "Tema, paleta e fuso horário", "Seu nome e configurações que não são financeiras", "Categorias padrão (voltam ao original)"]}
            />
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="button" variant="danger" onClick={() => setStep(2)}>Continuar</Button>
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4 overflow-y-auto p-5 sm:p-6" data-testid="wipe-step-2">
            <p className="text-ink-2">Depois de apagar, não há como recuperar. Baixe uma cópia dos seus dados agora, se quiser.</p>
            <ExportLinks />
            <div className="flex flex-wrap justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
              <Button type="button" variant="danger" className="h-auto min-h-11 whitespace-normal py-2.5 text-center" onClick={() => setStep(3)}>Continuar sem exportar</Button>
            </div>
          </div>
        )}
        {step === 3 && (
          <form action={action} className="grid gap-4 overflow-y-auto p-5 sm:p-6" data-testid="wipe-step-3">
            {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
            <Field label={`Digite exatamente ${CLEAR_ALL_PHRASE}`} htmlFor="wipe-confirm">
              <Input id="wipe-confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <Field label="Sua senha atual" htmlFor="wipe-password" hint={<span className="text-xs text-ink-3">para confirmar que é você</span>}>
              <Input id="wipe-password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            <div className="flex flex-wrap justify-between gap-3">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>Voltar</Button>
              <Button type="submit" variant="danger" className="h-auto min-h-11 whitespace-normal py-2.5 text-center" loading={pending} disabled={typed !== CLEAR_ALL_PHRASE}>
                Apagar todos os meus dados financeiros
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Seção "Gerenciamento de dados" das Configurações. */
export function DataManagement() {
  return (
    <div className="grid gap-6">
      <section aria-labelledby="dm-export" className="grid gap-3">
        <div>
          <h3 id="dm-export" className="font-semibold">Exportar meus dados</h3>
          <p className="text-sm text-ink-3">Um arquivo só com os seus dados, sem senhas nem chaves. O CSV abre direto no Excel.</p>
        </div>
        <ExportLinks />
      </section>
      <section aria-labelledby="dm-entries" className="grid gap-3 border-t border-border pt-6">
        <div>
          <h3 id="dm-entries" className="font-semibold">Limpar meus lançamentos</h3>
          <p className="text-sm text-ink-3">Apaga o histórico de movimentações e mantém contas, cartões, categorias e preferências.</p>
        </div>
        <div><ClearEntries /></div>
      </section>
      <section aria-labelledby="dm-all" className="grid gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--negative)_35%,var(--border))] p-4">
        <div>
          <h3 id="dm-all" className="font-semibold text-negative">Limpar todos os meus dados financeiros</h3>
          <p className="text-sm text-ink-3">Volta ao zero: apaga tudo o que é financeiro e mantém seu login e suas preferências. Pede confirmação em 3 etapas.</p>
        </div>
        <div><ClearAll /></div>
      </section>
    </div>
  );
}
