"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";

/** Falha ao carregar dados: explica e oferece caminho, sem mostrar valores inventados. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Panel className="max-w-xl">
      <h1 className="text-xl font-semibold tracking-tight">Não foi possível carregar seus dados</h1>
      <p className="mt-2 text-ink-2">
        O banco de dados não respondeu como esperado. Se você acabou de configurar o Supabase, confira se todas as migrations foram aplicadas.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={reset}>Tentar de novo</Button>
        {process.env.NODE_ENV !== "production" && (
          <Button asChild variant="outline">
            <Link href="/diagnostico">Verificar a configuração</Link>
          </Button>
        )}
      </div>
    </Panel>
  );
}
