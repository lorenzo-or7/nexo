"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { requestPasswordReset, signIn, signUp, updatePassword, type FormState } from "./actions";

function PasswordInput({ id, autoComplete, invalid }: { id: string; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} name={id} type={show ? "text" : "password"} autoComplete={autoComplete} required aria-invalid={invalid || undefined} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-[var(--radius-control)] text-ink-3 hover:text-ink"
        aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </button>
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: React.ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-[1.875rem] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
      <p className="mt-2 text-ink-2">{sub}</p>
    </header>
  );
}

export function SignInForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, undefined);
  return (
    <>
      <Heading title="Entrar" sub={<>Ainda não tem conta? <Link href="/cadastro" className="font-medium text-accent underline-offset-4 hover:underline">Criar conta</Link></>} />
      <form action={action} className="grid gap-5" noValidate>
        <input type="hidden" name="next" value={next ?? "/"} />
        {linkError && !state && <FormMessage tone="error">O link expirou ou já foi usado. Entre ou peça um novo link.</FormMessage>}
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={state?.fields?.email} />
        </Field>
        <Field label="Senha" htmlFor="password" hint={<Link href="/recuperar-senha" className="text-sm text-accent underline-offset-4 hover:underline">Esqueci a senha</Link>}>
          <PasswordInput id="password" autoComplete="current-password" />
        </Field>
        <Button type="submit" size="lg" loading={pending} className="mt-2">Entrar</Button>
      </form>
    </>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, undefined);
  if (state?.success) {
    return (
      <>
        <Heading title="Confira seu e-mail" sub={state.success} />
        <Button asChild variant="outline" size="lg"><Link href="/entrar">Voltar para o login</Link></Button>
      </>
    );
  }
  return (
    <>
      <Heading title="Criar conta" sub={<>Já tem conta? <Link href="/entrar" className="font-medium text-accent underline-offset-4 hover:underline">Entrar</Link></>} />
      <form action={action} className="grid gap-5" noValidate>
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        <Field label="Nome" htmlFor="name">
          <Input id="name" name="name" autoComplete="given-name" required defaultValue={state?.fields?.name} />
        </Field>
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required defaultValue={state?.fields?.email} />
        </Field>
        <Field label="Senha" htmlFor="password">
          <PasswordInput id="password" autoComplete="new-password" />
          <p className="text-sm text-ink-3">Mínimo de 8 caracteres, com letras e números.</p>
        </Field>
        <Button type="submit" size="lg" loading={pending} className="mt-2">Criar conta</Button>
      </form>
    </>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPasswordReset, undefined);
  return (
    <>
      <Heading title="Recuperar senha" sub="Enviaremos um link para você criar uma nova senha." />
      <form action={action} className="grid gap-5" noValidate>
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        {state?.success && <FormMessage tone="success">{state.success}</FormMessage>}
        <Field label="E-mail" htmlFor="email">
          <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
        </Field>
        <Button type="submit" size="lg" loading={pending}>Enviar link</Button>
        <Link href="/entrar" className="text-center text-sm text-ink-2 underline-offset-4 hover:underline">Voltar para o login</Link>
      </form>
    </>
  );
}

export function ResetForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(updatePassword, undefined);
  return (
    <>
      <Heading title="Nova senha" sub="Escolha uma senha que você não usa em outros sites." />
      <form action={action} className="grid gap-5" noValidate>
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        <Field label="Nova senha" htmlFor="password"><PasswordInput id="password" autoComplete="new-password" /></Field>
        <Field label="Repita a nova senha" htmlFor="confirm"><PasswordInput id="confirm" autoComplete="new-password" /></Field>
        <Button type="submit" size="lg" loading={pending}>Salvar nova senha</Button>
      </form>
    </>
  );
}
