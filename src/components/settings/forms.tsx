"use client";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Picker } from "@/components/ui/picker";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/components/ui/toast";
import { DELETE_ACCOUNT_PHRASE } from "@/lib/data-management";
import { clearDemo, deleteAccount, loadDemo, saveProfile, type ActionResult } from "@/app/(app)/actions";

function useResultToast(state: ActionResult) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) toast.show({ tone: "success", message: state.message });
  }, [state, toast]);
}

export function DemoLoader({ compact }: { compact?: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(loadDemo, undefined);
  useResultToast(state);
  return (
    <form action={action} className="grid gap-4">
      {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      <p className="text-sm text-ink-2">
        Carrega o cenário de teste (saldo de R$ 321,12, duas faturas e dois recebimentos previstos em outubro) separado dos seus dados reais.
        Escolha em qual conta o saldo de referência deve ficar.
      </p>
      <div className={compact ? "grid gap-4 sm:grid-cols-2" : "grid gap-4 sm:grid-cols-2"}>
        <Field label="Nome da conta" htmlFor="account">
          <Input id="account" name="account" required placeholder="Conta principal" />
        </Field>
        <Field label="Instituição" htmlFor="institution">
          <Input id="institution" name="institution" placeholder="Ex.: Nubank" />
        </Field>
      </div>
      <Button type="submit" loading={pending} className="justify-self-start">Carregar demonstração</Button>
    </form>
  );
}

export function DemoClear() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(clearDemo, undefined);
  useResultToast(state);
  return (
    <form action={action} className="grid gap-3">
      {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      <Button type="submit" variant="outline" loading={pending} className="justify-self-start">Remover demonstração</Button>
    </form>
  );
}

const TZ: [string, string][] = [
  ["America/Sao_Paulo", "Brasília (São Paulo)"],
  ["America/Manaus", "Amazonas (Manaus)"],
  ["America/Cuiaba", "Mato Grosso (Cuiabá)"],
  ["America/Porto_Velho", "Rondônia (Porto Velho)"],
  ["America/Rio_Branco", "Acre (Rio Branco)"],
  ["America/Belem", "Pará (Belém)"],
  ["America/Fortaleza", "Nordeste (Fortaleza)"],
  ["America/Recife", "Pernambuco (Recife)"],
  ["America/Noronha", "Fernando de Noronha"],
];

export function ProfileForm({
  initial,
}: {
  initial: { display_name: string; timezone: string; reserve: string; margin: string; include_expected_income: boolean };
}) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveProfile, undefined);
  useResultToast(state);
  return (
    <form action={action} className="grid gap-5">
      {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nome" htmlFor="display_name">
          <Input id="display_name" name="display_name" defaultValue={initial.display_name} required />
        </Field>
        <Field label="Fuso horário" htmlFor="timezone">
          <Picker id="timezone" name="timezone" defaultValue={initial.timezone} options={TZ.map(([v, l]) => ({ value: v, label: l }))} />
        </Field>
        <Field label="Reserva mínima" htmlFor="reserve">
          <MoneyInput id="reserve" name="reserve" defaultValue={initial.reserve} />
          <p className="text-sm text-ink-3">Valor que nunca entra no &ldquo;livre para gastar&rdquo;.</p>
        </Field>
        <Field label="Margem de segurança" htmlFor="margin">
          <MoneyInput id="margin" name="margin" defaultValue={initial.margin} />
          <p className="text-sm text-ink-3">Folga extra para imprevistos.</p>
        </Field>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input type="checkbox" name="include_expected_income" defaultChecked={initial.include_expected_income} className="mt-1 size-4 accent-[var(--accent)]" />
        <span>
          <span className="block font-medium">Contar recebimentos ainda não confirmados</span>
          <span className="block text-sm text-ink-3">Quando desligado, a projeção e o &ldquo;livre para gastar&rdquo; só consideram entradas confirmadas.</span>
        </span>
      </label>
      <Button type="submit" loading={pending} className="justify-self-start">Salvar preferências</Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(deleteAccount, undefined);
  const [phrase, setPhrase] = useState("");
  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  // conveniência: o servidor confere tudo de novo
  const ready = phrase === DELETE_ACCOUNT_PHRASE && understood && password.length > 0;
  return (
    <form action={action} className="grid gap-4" data-testid="delete-account-form">
      {state && !state.ok && <FormMessage tone="error">{state.error}</FormMessage>}
      <p className="text-sm text-ink-2">
        Apaga <strong>permanentemente</strong> seu login e todos os dados: contas, cartões, lançamentos, assinaturas e histórico. Não há como desfazer.
        Exporte antes em &ldquo;Gerenciamento de dados&rdquo; se quiser guardar uma cópia.
      </p>
      <Field label={`Digite ${DELETE_ACCOUNT_PHRASE} para confirmar`} htmlFor="confirm">
        <Input id="confirm" name="confirm" autoComplete="off" value={phrase} onChange={(e) => setPhrase(e.target.value)} className="max-w-xs" />
      </Field>
      <Field label="Sua senha atual" htmlFor="delete-password">
        <Input id="delete-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs" />
      </Field>
      <label className="flex items-start gap-2 text-sm text-ink-2">
        <input type="checkbox" name="understood" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>Entendo que a exclusão da conta é permanente e irreversível.</span>
      </label>
      <Button type="submit" variant="danger" loading={pending} disabled={!ready} className="h-auto min-h-11 justify-self-start whitespace-normal py-2.5 text-center">Excluir conta e dados</Button>
    </form>
  );
}
