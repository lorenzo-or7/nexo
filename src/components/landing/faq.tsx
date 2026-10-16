"use client";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section";

/**
 * Respostas baseadas no que o NEXO faz hoje (código e documentação do projeto).
 * REVISAR: a resposta sobre preço depende de decisão do responsável pelo projeto.
 */
export const FAQ_ITEMS = [
  { q: "O que é o NEXO?", a: "É um site de gestão financeira pessoal. Ele reúne contas, cartões, faturas, parcelamentos, assinaturas e a projeção do seu saldo dia a dia, para você saber quanto pode gastar antes de gastar." },
  { q: "Como o NEXO ajuda a organizar minhas finanças?", a: "Você registra entradas, saídas e transferências, organiza tudo em categorias e acompanha no painel o saldo de hoje, o que ainda vai entrar, o que ainda vai sair e quanto está livre para gastar até o fim do período." },
  { q: "Posso gerenciar mais de uma conta?", a: "Sim. Você pode cadastrar várias contas e cartões, transferir dinheiro entre as contas e ver o saldo de cada uma e o total no mesmo lugar." },
  { q: "Como funcionam as projeções?", a: "A projeção parte do saldo atual e soma, dia a dia, o que está previsto: recebimentos, faturas de cartão, assinaturas e rendas fixas. Ela mostra o menor saldo do período e o quanto está livre para gastar. Você escolhe se recebimentos ainda não confirmados entram na conta." },
  { q: "O NEXO é gratuito?", a: "Ainda não há planos nem preços publicados. Esta resposta será atualizada assim que essa definição for feita." },
  { q: "Meus dados financeiros estão protegidos?", a: "Cada pessoa só acessa os próprios dados: o banco de dados isola as informações por conta em todas as tabelas e não há acesso público a elas. Você pode exportar tudo em um arquivo e excluir sua conta e seus dados quando quiser. A autenticação usa o Supabase." },
  { q: "O NEXO conecta automaticamente aos bancos?", a: "Não. Hoje os lançamentos são registrados por você; não existe integração automática com bancos." },
  { q: "Posso utilizar pelo celular?", a: "Sim. O NEXO funciona no navegador do celular, com navegação própria para telas pequenas, e também no tablet e no computador." },
] as const;

export function Faq() {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section id="faq" aria-labelledby="titulo-faq" className="scroll-mt-20 mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-28">
      <SectionHeading id="titulo-faq" eyebrow="FAQ" title="Perguntas frequentes" />
      <Reveal className="mt-12 grid gap-3">
        {FAQ_ITEMS.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className={cn("panel-quiet rounded-2xl transition-colors", isOpen && "border-border-strong")}>
              <h3>
                <button
                  type="button"
                  id={`faq-b-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-p-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl px-5 py-3 text-left text-[1.0625rem] font-medium"
                >
                  {item.q}
                  <ChevronDown aria-hidden className={cn("size-5 shrink-0 text-ink-3 transition-transform duration-300", isOpen && "rotate-180 text-accent")} />
                </button>
              </h3>
              <div id={`faq-p-${i}`} role="region" aria-labelledby={`faq-b-${i}`} className={cn("grid transition-[grid-template-rows] duration-300", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="min-h-0 overflow-hidden" inert={!isOpen}>
                  <p className="px-5 pb-5 leading-relaxed text-ink-2">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}
