import Link from "next/link";
import { Button } from "@/components/ui/button";

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Crie um projeto grátis no Supabase",
    body: (
      <>
        Em <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="font-medium text-accent underline-offset-4 hover:underline">supabase.com</a>, clique em New project e guarde a senha do banco.
      </>
    ),
  },
  {
    title: "Crie as tabelas",
    body: (
      <>
        No painel, abra <strong className="font-medium text-ink">SQL Editor → New query</strong>. Cole cada arquivo da pasta <code>supabase/migrations</code>, um de cada vez e em ordem (são 8), e clique em Run.
      </>
    ),
  },
  {
    title: "Copie as chaves para o .env.local",
    body: (
      <>
        Em <strong className="font-medium text-ink">Project Settings → API Keys</strong> e <strong className="font-medium text-ink">Data API</strong>, copie a Project URL e a chave pública (anon ou publishable) para o arquivo <code>.env.local</code> na pasta do projeto.
      </>
    ),
  },
  {
    title: "Reinicie o servidor",
    body: (
      <>
        No terminal, pare com <kbd className="rounded border border-border-strong px-1 text-xs">Ctrl</kbd>+<kbd className="rounded border border-border-strong px-1 text-xs">C</kbd> e rode <code>npm run dev</code> de novo. O Next só lê o <code>.env.local</code> ao iniciar.
      </>
    ),
  },
];

/** Mostrado no lugar do login enquanto o banco não está conectado. */
export function SetupGuide() {
  return (
    <div>
      <h1 className="text-[1.875rem] font-semibold leading-tight tracking-[-0.03em]">Falta conectar o banco de dados</h1>
      <p className="mt-2 text-ink-2">
        O NEXO guarda suas contas e cartões no Supabase. Sem ele, não há onde criar o seu login. São 4 passos, uma vez só:
      </p>
      <ol className="mt-8 grid gap-6">
        {STEPS.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-3">
            <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{i + 1}</span>
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2 [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:text-ink">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button asChild size="lg" className="mt-10 w-full">
        <Link href="/diagnostico">Verificar a configuração</Link>
      </Button>
    </div>
  );
}
