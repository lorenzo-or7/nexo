# NEXO — Relatório final de correção e homologação (28/10/2026)

**Decisão final: APTO COM RESSALVAS** (ressalvas na seção F). Nada foi publicado, nenhuma migration foi executada em produção, nenhum dado real foi tocado. Todos os testes abaixo rodaram **no ambiente da sessão** (PGlite, PostgreSQL 16 de teste com papéis estilo Supabase, Chromium/Playwright) com dados fictícios. **Nada foi executado no seu Docker nem no seu banco local**; o que você validou lá (backup restaurado, 4 migrations, 5 tabelas preservadas) é informação sua, que não verifiquei.

## A. Correções realizadas
| # | Problema | Solução | Arquivos |
|---|---|---|---|
| 1 | `_wipe_finish(boolean)` era `SECURITY DEFINER`, executável por `authenticated` e protegida só pela variável de sessão `nexo.wiping`. Uma variável de sessão não é autorização. Alcance real: só o próprio usuário (`auth.uid()`), mas permitia apagar o próprio histórico de auditoria e recriar categorias fora do fluxo. | **Escalonamento não explorável contra outro usuário, mas corrigido por princípio de privilégio mínimo.** `_wipe_finish(uuid, boolean)` agora é `SECURITY INVOKER` e **sem EXECUTE para anon/authenticated/PUBLIC** (só o dono do banco). `clear_my_entries` e `clear_all_financial_data` viram o único ponto de entrada (`SECURITY DEFINER`, `search_path` fixo, usuário só por `auth.uid()`, todo comando filtra `user_id`). O marcador de sessão deixou de existir. Mesmos nomes, parâmetros e retornos: o app não muda. | `supabase/migrations/20261028000200_wipe_hardening.sql` |
| 2 | Tela mostrava "Falta pagar" só com pagamentos confirmados; o banco também conta os agendados. Era possível oferecer (e a tela nem listava o agendado) um valor que o banco recusaria. | Regra única: `Pago`/`Falta` = confirmados; `payable = Falta − agendados` é o padrão e o limite do campo. A tela lista o pagamento agendado (marcado, com estorno), avisa quanto está agendado e esconde o botão quando o agendado cobre tudo. A action valida contra `payable` e o banco continua sendo a barreira final. **Sem mudança de regra no banco; sem migration.** | `src/domain/billing.ts`, `src/lib/data/cards.ts`, `src/app/(app)/cartoes/actions.ts`, `src/components/cards/invoice-payments.tsx`, preview |
| 3 | Revisão de `require_user`, `seed_default_categories` e das migrations 1500/1600/1700/0100 | Sem outra falha encontrada: `seed_default_categories` já era negada a usuários (S8); `require_user` é invoker e só lê `auth.uid()`; 1500/1600/0100 inalteradas. | — |

Decisões visuais e funcionalidades aprovadas: preservadas (nenhuma tela redesenhada; a única mudança visível é a linha de aviso de agendamento no pagamento, só quando existe agendado).

## B. Testes executados (resultados reais desta rodada)
| Suíte | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| TypeScript `tsc` | OK | 0 | — |
| ESLint | 0 erros / 0 avisos | — | — |
| Vitest (domínio, banco PGlite, actions) | **200** | 0 | 0 |
| Playwright (desktop + celular, suíte completa) | **176** | 0 | **4** (testes só de celular) |
| `next build` | OK | — | — |
| PostgreSQL 16 real, papéis estilo Supabase (`supabase/audit`) | **33** | **0** | 2 WARN + 1 INFO |

Testes novos: 4 de domínio (agendado × restante), 1 de banco PGlite (agendado, estorno, estorno duplo, outro usuário), 2 de e2e (aviso de agendado; ausência do aviso), `S7` reescrito, `W1` novo (auditoria isolada), `S4` ajustado (o definer pode derivar o usuário por `require_user()`).

Observação honesta: na primeira execução completa do Vitest, rodada **enquanto o Playwright usava a máquina**, o arquivo `db.test.ts` falhou no nível da suíte (59 testes não rodaram). Ele passou sozinho (duas vezes) e na execução completa seguinte, sem concorrência. Não investiguei a causa além disso; trato como sensibilidade a carga (tempo de preparação do PGlite). Rode a suíte sem outros processos pesados.

Cenários pedidos e onde estão: anônimo em função protegida (S7, S5, P1, F13); autenticado em auxiliar (S7, S8); dados de outro usuário (F2, W1, P1); limpeza parcial e completa (F9, F12); falha intermediária com rollback (F10); preferências e login preservados (F12); categorias padrão recriadas (F12); pagamento normal, parcial e agendado (F3, P5, PGlite); simultâneos (P4, F5); estorno e estorno duplicado (F4, PGlite); renda fixa (F7). A mutação da trava de `pay_invoice` continua detectada por P4 (verificada na rodada anterior; não repeti agora).

## C. Segurança
**Corrigido:** `_wipe_finish` (item A1); nenhum papel de usuário o executa, nem com marcador forjado nem com o id de outro (S7: "permission denied"); auditoria do Bob idêntica depois que a Alice limpa tudo (W1).
**Pendências / WARN (sem efeito pela API):**
- S5: auxiliares e gatilhos (`require_user`, `fixed_income_date`, `tg_*`, `handle_new_user`) ainda executáveis por anon/PUBLIC (padrão do Postgres).
- S10: `TRUNCATE/REFERENCES/TRIGGER` concedidos a `authenticated` por padrão do Supabase (só alcançáveis com SQL direto).
- Ambos têm correção pronta e testada em `supabase/audit/opcional/endurecimento.sql` — **opcional, fora das migrations, não aplicado.**
- Quem entra sem senha não consegue a reautenticação por senha para limpar/excluir a conta.

## D. Integridade
- Banco vazio → 19 migrations aplicam sem erro (M2). Estado anterior (até `20261017001400`) com dados fictícios de 2 usuários + as **5** migrations novas: contagens de 22 tabelas e saldos idênticos (M4).
- `verificar-migrations.sql` detecta corretamente completo e parcial (M5, 19 linhas).
- **Não verifiquei** o seu backup nem o seu banco local (sem acesso). As cinco tabelas e os números que você informou ficam como validação sua. Como o seu `nexo_restore` já tem as 4 migrations, só a `20261028000200` falta lá; ela é reaplicável (M3) e foi testada em sequência sobre o estado com as 4 (M4).

## E. Publicação
Ver `PUBLICACAO.md` (ordem exata, verificação e rollback).

## F. Decisão final: APTO COM RESSALVAS
Justificativa: 0 falhas em todas as suítes e as duas correções verificadas. Ressalvas, nenhuma que eu considere bloqueante: (1) rodei contra um Postgres de teste, não contra o Supabase real nem o PostgREST (as migrations usam só SQL padrão e `auth.uid()`; confirme com `verificar-seguranca.sql` após aplicar); (2) a migration `20261028000200` precisa estar no banco **junto** com o código novo — o código antigo continua funcionando com ela (mesmas assinaturas); (3) o aviso de carga no Vitest acima; (4) WARNs opcionais S5/S10; (5) 4 testes ignorados são só de celular, de propósito.

## Evidências do banco (36 verificações, última execução)
| ID | Status | Verificação | Evidência |
|---|---|---|---|
| M1 | PASS | Nomes no padrão do Supabase, versões únicas, em ordem estritamente crescente | 19 migrations, de 20261008000100 a 20261028000200: 20261008000100, 20261008000200, 20261008000300, 20261008000400, 20261009000500, 20261009000600, 20261009000700, 20261009000800, 20261009000900, 20261009001000, 20261010001100, 20261016001200, 20261016001300, 20261017001400, 20261027001500, 20261027001600, 20261027001700, 2026102 |
| M2 | PASS | Todas aplicam em sequência num banco vazio com papéis/privilégios estilo Supabase | 19/19 aplicadas sem erro no PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1); 22 tabelas, 40 funções em public |
| M3 | INFO | Reaplicar cada migration sobre o banco já migrado (quais são seguras para rodar de novo) | Reaplicáveis sem erro: 20261009000600, 20261009000800, 20261010001100, 20261016001300, 20261017001400, 20261027001500, 20261027001600, 20261027001700, 20261028000100, 20261028000200. NÃO reexecutar (falham se já aplicadas): 20261008000100 (type "cents" already exists); 20261008000200 (policy "accounts_owner" for table "accounts" |
| M4 | PASS | Atualização com dados fictícios: estado anterior (até 20261017001400) + as 5 novas migrations preservam os dados | 5 migrations novas aplicadas sobre dados existentes; contagens de 21 tabelas idênticas para os 2 usuários; remove_fixed_income = deleted_with_history |
| M5 | PASS | Script de detecção (somente leitura) identifica corretamente quais migrations já foram aplicadas | banco completo: 19/19 detectadas; banco parcial: faltam exatamente 20261027001500, 20261027001600, 20261027001700, 20261028000100, 20261028000200 |
| S1 | PASS | RLS ligada em todas as tabelas de public e nenhuma política 'aberta' (using true) | 22 tabelas com RLS, 23 políticas, todas restritas a authenticated e filtrando por auth.uid() |
| S2 | PASS | anon não tem nenhum privilégio em tabelas/views de public | 0 privilégios de anon em 24 relações |
| S3 | PASS | Views usam security_invoker (RLS do usuário continua valendo) | views: invoice_payments, account_balances |
| S4 | PASS | Funções SECURITY DEFINER: search_path fixo, e nenhuma aceita um id de usuário vindo do cliente | 9 definers: check_transfer[interna], clear_all_financial_data[authenticated], clear_my_entries[authenticated], ensure_profile[authenticated], handle_new_user[trigger], seed_default_categories[interna], tg_audit[trigger], tg_entries_transfer[trigger], tg_transfers_row[trigger] |
| S5 | WARN | Permissão EXECUTE: nenhuma RPC de negócio é executável por anon/PUBLIC; todas são por authenticated | 31 RPCs de negócio: 0 para anon. Auxiliares/gatilhos ainda executáveis por anon/PUBLIC (privilégio padrão do Postgres; sem efeito, pois exigem contexto de gatilho ou sessão): fixed_income_date, handle_new_user, require_user, tg_audit, tg_category_kind_cascade, tg_category_rules, tg_entries_transfer, tg_touch, tg_transfers_row. R |
| S6 | PASS | Gatilhos SECURITY DEFINER não podem ser chamados diretamente como função | handle_new_user: trigger functions can only be called as triggers / tg_audit: trigger functions can only be called as triggers / tg_entries_transfer: trigger functions can only be called as triggers / tg_transfers_row: trigger functions can only be called as triggers |
| S7 | PASS | _wipe_finish: nenhum papel de usuário executa (anon, authenticated, PUBLIC), nem forjando marcador ou usando o id de outro | assinatura única _wipe_finish(uuid,boolean), invoker, sem EXECUTE para anon/authenticated/PUBLIC; Alice com o próprio id ("permission denied for functi"), Alice com o id do Bob ("permission denied for functi"), anon ("permission denied for functi") e marcador forjado: todos recusados; Bob e sua auditoria (16 linhas) idênticos |
| S8 | PASS | seed_default_categories(uuid) (definer) não é executável por usuários (impede criar categorias na conta de outro) | permission denied for function seed_default_categories |
| S9 | PASS | authenticated não consegue forjar nem alterar a auditoria (audit_log) | insert negado; update e delete afetam 0 linhas (RLS só permite SELECT) |
| S10 | WARN | Privilégios de tabela além do necessário para authenticated (TRUNCATE/REFERENCES/TRIGGER) | 22 tabelas concedem trigger/references/truncate a authenticated (privilégio padrão do Supabase: ALTER DEFAULT PRIVILEGES ... GRANT ALL). Não é alcançável pela API REST (não existe verbo TRUNCATE) e RLS cobre select/insert/update/delete, mas TRUNCATE ignora RLS se alguém obtiver SQL direto. Recomendação: opcional/endurecimento.sq |
| S11 | PASS | Endurecimento opcional (revogar extras) não quebra nada: RPCs principais continuam funcionando | extras revogados (0 restantes); seed completo, pay_invoice, export_my_data e clear_my_entries OK no banco endurecido |
| F1 | PASS | Leitura: cada usuário vê exatamente as próprias linhas em todas as tabelas e views | 21 tabelas + 2 views: 0 linhas de outro usuário visíveis (A:83 linhas, B:83) |
| F2 | PASS | Escrita cruzada: Bob não consegue usar, alterar nem apagar nada da Alice (ids reais da Alice) | 21 tentativas do Bob com ids da Alice: todas recusadas; impressão da Alice inalterada (acb4656a) |
| F3 | PASS | Pagamento parcial e total: não é despesa de consumo, reduz o saldo da conta e é idempotente | saldo da conta caiu exatamente 10000 (4000+6000); consumo (despesas) inalterado em 2500; chave repetida devolveu o mesmo id |
| F4 | PASS | Estorno: devolve o saldo, é auditável, não repete e só o dono consegue | saldo +6000; 2º estorno recusado; Bob recusado; linha preservada (deleted_at) com 2 registros de auditoria; novo pagamento aceito |
| F5 | PASS | Concorrência: 8 requisições simultâneas com a mesma chave criam 1 único pagamento | 8 chamadas paralelas → 1 linha, mesmo id para todas |
| P0 | PASS | Preparação: cartão/compra 3x de 10.000 para a Alice e para o Bob (faturas 2026-10..12) | ok |
| P1 | PASS | Propriedade: cartão e conta de outro usuário (ou conta arquivada) são recusados; anon também | Cartão não encontrado / Conta não encontrada / permission denied for functi / Conta não encontrada |
| P2 | PASS | Status permitidos: só confirmed e scheduled; valor, fatura e data inválidos são recusados | expected/foo/vazio/null/CONFIRMED recusados; 0, negativo, fatura mal formada e data nula recusados; scheduled aceito (e estornado) |
| P3 | PASS | Idempotência consistente: mesma chave = mesmo pedido; pedido diferente, outra operação, pagamento estornado e corrida são tratados | replay = mesmo id; valor/fatura/conta diferentes e chave de outra operação recusados; chave estornada não ressuscita; 4 corridas com a mesma chave → 1 vencedor/1 linha; 8 repetições → 1 id; chave por usuário |
| P4 | PASS | Concorrência: pagamentos simultâneos NUNCA ultrapassam o devido (20×1.000 numa fatura de 10.000; depois 6×4.000) | 20×1.000 → 10 aceitos, pago 10.000; 6×4.000 → 2 aceitos, pago 8.000; estorno+4 pagamentos simultâneos → pago 4000 ≤ 10.000; Bob paga a sua fatura sem interferir |
| P5 | PASS | Matriz: parcial, integral, excedente, fatura quitada, estorno e novo pagamento | 2.500 + 7.500 = quitada; +1 recusado; estorno de 7.500 → falta 7.500; 7.501 e 99.999.999.999 recusados; 7.500 quita de novo; nenhum pagamento vira despesa de consumo |
| F7 | PASS | Excluir renda fixa: some e nunca volta; histórico confirmado preservado; Bob intacto | com confirmado → deleted_with_history (1 confirmado mantido, 2 previstos removidos); sem confirmado → deleted (linha apagada); reaparecer/relançar recusado; Bob idêntico |
| F8 | PASS | export_my_data: só dados do próprio usuário, sem segredos, e anon não exporta | 20 seções; todos os user_id = Alice; Bob e Alice trocados: 0 vazamentos; anon recusado |
| F9 | PASS | Limpar lançamentos (Alice): zera movimentações, preserva cadastros, não toca no Bob | removido: {"entries":28,"purchases":2,"transfers":1,"card_charges":6,"subscription_charges":0}; cadastros preservados; Bob idêntico (d5f903ff); marcador de recomeço gravado; auditoria dos lançamentos limpa |
| F10 | PASS | Atomicidade: se um passo da limpeza total falha, NADA é apagado | erro "falha injetada" no meio das duas funções → 22 tabelas da Alice e do Bob idênticas (rollback total) |
| F11 | PASS | Limpar tudo: execução dupla simultânea é segura (sem deadlock, sem estado parcial, sem tocar no Bob) | 2 execuções simultâneas concluídas sem erro (advisory lock por usuário); Bob idêntico |
| F12 | PASS | Limpar tudo: não sobra NENHUM dado financeiro da Alice em nenhuma tabela; login e preferências ficam | 21 tabelas verificadas dinamicamente; só restam as 42 categorias padrão; auth.users e profiles preservados (tema dark, fuso America/Sao_Paulo); a conta continua utilizável (42 categorias visíveis) |
| W1 | PASS | Auditoria isolada: Alice limpando tudo apaga só o histórico dela; o do Bob permanece intacto | Alice tinha 16 linhas de auditoria, Bob 39: após limpar tudo a da Alice = 0 e a do Bob idêntica (a467b2ff); clear_my_entries também não tocou no Bob |
| F13 | PASS | Reautenticação/identidade: limpeza usa só o JWT; o Bob limpando não afeta a Alice e anon/sem sessão não limpa nada | assinaturas sem parâmetro de usuário (export_my_data(); clear_my_entries(date); clear_all_financial_data()); anon e JWT sem sub recusados; Bob limpou a própria conta e a Alice permaneceu idêntica (692bc42c) |
| R1 | PASS | Compra parcelada estornada: Lançamentos (parcelas ativas) + estornos = consumo do gráfico, no banco real | valor cheio da compra 30.000 (o que Lançamentos mostrava) → parcelas ativas 20.000 − estorno 10.000 = 10.000, idêntico ao total do cartão no gráfico, também por categoria |
