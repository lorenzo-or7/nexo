# NEXO — Homologação final (28/10/2026)

Nada foi publicado, nenhuma migration foi executada em produção e nenhum dado real foi tocado. Todos os dados são fictícios (usuários Alice e Bob).

## Resultado geral

| Verificação | Resultado |
|---|---|
| TypeScript (`tsc`) | PASS, 0 erros |
| ESLint | PASS, 0 erros e 0 avisos |
| Vitest (domínio, banco em PGlite, actions) | PASS, 187 de 187 |
| `next build` | PASS |
| Playwright desktop + celular (174 testes) | 168 passaram e 4 foram ignorados (só celular) na rodada completa; 2 falhas eram de teste (ver abaixo) e, corrigidas, os arquivos afetados passaram (30 de 30) |
| Banco em Postgres 16 real, papéis estilo Supabase (`supabase/audit`) | 27 PASS, 2 WARN, 1 INFO, **1 FAIL (F6)** |

## Itens pedidos
1. **Parceladas × gráfico × Lançamentos: corrigido.** Causas: (a) o gráfico contava assinaturas futuras no cartão (só previsão); (b) Lançamentos mostrava a compra pelo valor cheio, sem descontar parcelas canceladas, estornos e reembolsos. Agora `spendingLines` + `consumptionFor` são a única conta, e Lançamentos mostra o valor líquido e um painel "Consumo". Testes: 3 de domínio, 4 e2e e R1 no banco real.
2. **Suíte completa:** tabela acima.
3. **Assinatura:** não é falha do produto. A imagem é lazy e, no servidor de dev, o primeiro `/_next/image` levou ~6 s (reproduzido: `complete=false` ao ficar visível, carregou em ~300 ms). O teste lia `naturalWidth` cedo demais; agora espera o carregamento.
4–5. **Migrations:** Postgres 16.15 real, papéis `anon/authenticated/service_role/authenticator` e privilégios padrão do Supabase. As 17 aplicam em ordem sem erro; a atualização a partir de 20261017001400 com dados preserva tudo. `verificar-migrations.sql` (somente leitura) mostra quais já foram aplicadas em produção. As três novas (1500, 1600, 1700) podem ser reexecutadas sem erro; as anteriores não.
6–8. **Dois usuários:** isolamento total de leitura e escrita (21 tentativas do Bob com ids da Alice, todas recusadas), pagamento, estorno, exclusão de renda, exportação e as duas limpezas, inclusive atomicidade e execução dupla simultânea.
7. **Reautenticação:** a senha é conferida contra o e-mail da sessão (teste com e-mail e id forjados no formulário) e a função do banco não aceita id de usuário.
9. **Funções:** 8 definers, todos com `search_path` fixo; nenhuma RPC de negócio executável por anon.

## Achados
- **FAIL F6 (médio-baixo):** o banco aceita pagamento de fatura acima do que falta (só a tela confere). Duas abas ou duplo envio com chaves diferentes podem pagar a mais; o dano fica na própria conta. Correção pronta e testada (O1): `supabase/audit/opcional/pay_invoice_guard.sql`. Recomendada antes de publicar.
- **WARN S10:** `authenticated` tem TRUNCATE/REFERENCES/TRIGGER (padrão do Supabase). Não é alcançável pela API. Opcional: `opcional/endurecimento.sql` (testado, S11).
- **WARN S5:** funções auxiliares e gatilhos executáveis por anon (inofensivas). Coberto pelo mesmo script.
- **Limite:** o `deleteAccount` pré-existente exige só digitar "EXCLUIR", sem senha; vale reforçar.
- **Não provado aqui:** Auth, SMTP, política de senha e rate limit do seu projeto Supabase, e o estado atual do banco de produção.

## Evidências (31 verificações)
| ID | Status | Verificação | Evidência |
|---|---|---|---|
| M1 | PASS | Nomes no padrão do Supabase, versões únicas, em ordem estritamente crescente | 17 migrations, de 20261008000100 a 20261027001700: 20261008000100, 20261008000200, 20261008000300, 20261008000400, 20261009000500, 20261009000600, 20261009000700, 20261009000800, 20261009000900, 20261009001000, 20261010001100, 20261016001200, 20261016001300, 20261017001400, 20261027001500, 20261027001600, 20261027001700 |
| M2 | PASS | Todas aplicam em sequência num banco vazio com papéis/privilégios estilo Supabase | 17/17 aplicadas sem erro no PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1); 22 tabelas, 40 funções em public |
| M3 | INFO | Reaplicar cada migration sobre o banco já migrado (quais são seguras para rodar de novo) | Reaplicáveis sem erro: 20261009000600, 20261009000800, 20261010001100, 20261016001300, 20261017001400, 20261027001500, 20261027001600, 20261027001700. NÃO reexecutar (falham se já aplicadas): 20261008000100 (type "cents" already exists); 20261008000200 (policy "accounts_owner" for table "accounts" already exists); 20261008000300 (trigger "on_auth_user_created" for relation "users" already exists); 20261008000400 (tri |
| M4 | PASS | Atualização com dados reais-fictícios: estado anterior (até 20261017001400) + 3 novas migrations preservam os dados | 3 migrations novas aplicadas sobre dados existentes; contagens de 21 tabelas idênticas para os 2 usuários; remove_fixed_income = deleted_with_history |
| M5 | PASS | Script de detecção (somente leitura) identifica corretamente quais migrations já foram aplicadas | banco completo: 17/17 detectadas; banco parcial: faltam exatamente 20261027001500, 20261027001600, 20261027001700 |
| S1 | PASS | RLS ligada em todas as tabelas de public e nenhuma política 'aberta' (using true) | 22 tabelas com RLS, 23 políticas, todas restritas a authenticated e filtrando por auth.uid() |
| S2 | PASS | anon não tem nenhum privilégio em tabelas/views de public | 0 privilégios de anon em 24 relações |
| S3 | PASS | Views usam security_invoker (RLS do usuário continua valendo) | views: invoice_payments, account_balances |
| S4 | PASS | Funções SECURITY DEFINER: search_path fixo, e nenhuma aceita um id de usuário vindo do cliente | 8 definers: _wipe_finish[authenticated], check_transfer[interna], ensure_profile[authenticated], handle_new_user[trigger], seed_default_categories[interna], tg_audit[trigger], tg_entries_transfer[trigger], tg_transfers_row[trigger] |
| S5 | WARN | Permissão EXECUTE: nenhuma RPC de negócio é executável por anon/PUBLIC; todas são por authenticated | 31 RPCs de negócio: 0 para anon. Auxiliares/gatilhos ainda executáveis por anon/PUBLIC (privilégio padrão do Postgres; sem efeito, pois exigem contexto de gatilho ou sessão): fixed_income_date, handle_new_user, require_user, tg_audit, tg_category_kind_cascade, tg_category_rules, tg_entries_transfer, tg_touch, tg_transfers_row. Recomendação: revogar (ver opcional/endurecimento.sql). |
| S6 | PASS | Gatilhos SECURITY DEFINER não podem ser chamados diretamente como função | handle_new_user: trigger functions can only be called as triggers / tg_audit: trigger functions can only be called as triggers / tg_entries_transfer: trigger functions can only be called as triggers / tg_transfers_row: trigger functions can only be called as triggers |
| S7 | PASS | _wipe_finish (definer) recusa chamada direta de usuário logado e de anon | sem marcador: "Operação não permitida"; anon: "permission denied for function _wipe_fin"; com marcador forjado por Alice, o Bob permanece idêntico (impressão 80d8724b) |
| S8 | PASS | seed_default_categories(uuid) (definer) não é executável por usuários (impede criar categorias na conta de outro) | permission denied for function seed_default_categories |
| S9 | PASS | authenticated não consegue forjar nem alterar a auditoria (audit_log) | insert negado; update e delete afetam 0 linhas (RLS só permite SELECT) |
| S10 | WARN | Privilégios de tabela além do necessário para authenticated (TRUNCATE/REFERENCES/TRIGGER) | 22 tabelas concedem trigger/references/truncate a authenticated (privilégio padrão do Supabase: ALTER DEFAULT PRIVILEGES ... GRANT ALL). Não é alcançável pela API REST (não existe verbo TRUNCATE) e RLS cobre select/insert/update/delete, mas TRUNCATE ignora RLS se alguém obtiver SQL direto. Recomendação: opcional/endurecimento.sql. |
| S11 | PASS | Endurecimento opcional (revogar extras) não quebra nada: RPCs principais continuam funcionando | extras revogados (0 restantes); seed completo, pay_invoice, export_my_data e clear_my_entries OK no banco endurecido |
| F1 | PASS | Leitura: cada usuário vê exatamente as próprias linhas em todas as tabelas e views | 21 tabelas + 2 views: 0 linhas de outro usuário visíveis (A:83 linhas, B:83) |
| F2 | PASS | Escrita cruzada: Bob não consegue usar, alterar nem apagar nada da Alice (ids reais da Alice) | 21 tentativas do Bob com ids da Alice: todas recusadas; impressão da Alice inalterada (a750a5e9) |
| F3 | PASS | Pagamento parcial e total: não é despesa de consumo, reduz o saldo da conta e é idempotente | saldo da conta caiu exatamente 10000 (4000+6000); consumo (despesas) inalterado em 2500; chave repetida devolveu o mesmo id |
| F4 | PASS | Estorno: devolve o saldo, é auditável, não repete e só o dono consegue | saldo +6000; 2º estorno recusado; Bob recusado; linha preservada (deleted_at) com 2 registros de auditoria; novo pagamento aceito |
| F5 | PASS | Concorrência: 8 requisições simultâneas com a mesma chave criam 1 único pagamento | 8 chamadas paralelas → 1 linha, mesmo id para todas |
| F6 | FAIL | Pagamento acima do que falta na fatura é recusado pelo BANCO (não só pela tela) | fatura de 10000 recebeu 20000 (5 de 5 aceitos); pagamento de 999.999,99: aceito |
| F7 | PASS | Excluir renda fixa: some e nunca volta; histórico confirmado preservado; Bob intacto | com confirmado → deleted_with_history (1 confirmado mantido, 2 previstos removidos); sem confirmado → deleted (linha apagada); reaparecer/relançar recusado; Bob idêntico |
| F8 | PASS | export_my_data: só dados do próprio usuário, sem segredos, e anon não exporta | 20 seções; todos os user_id = Alice; Bob e Alice trocados: 0 vazamentos; anon recusado |
| F9 | PASS | Limpar lançamentos (Alice): zera movimentações, preserva cadastros, não toca no Bob | removido: {"entries":14,"purchases":1,"transfers":1,"card_charges":3,"subscription_charges":0}; cadastros preservados; Bob idêntico (69c03379); marcador de recomeço gravado; auditoria dos lançamentos limpa |
| F10 | PASS | Atomicidade: se um passo da limpeza total falha, NADA é apagado | erro "falha injetada" no meio das duas funções → 22 tabelas da Alice e do Bob idênticas (rollback total) |
| F11 | PASS | Limpar tudo: execução dupla simultânea é segura (sem deadlock, sem estado parcial, sem tocar no Bob) | 2 execuções simultâneas concluídas sem erro (advisory lock por usuário); Bob idêntico |
| F12 | PASS | Limpar tudo: não sobra NENHUM dado financeiro da Alice em nenhuma tabela; login e preferências ficam | 21 tabelas verificadas dinamicamente; só restam as 42 categorias padrão; auth.users e profiles preservados (tema dark, fuso America/Sao_Paulo); a conta continua utilizável (42 categorias visíveis) |
| F13 | PASS | Reautenticação/identidade: limpeza usa só o JWT; o Bob limpando não afeta a Alice e anon/sem sessão não limpa nada | assinaturas sem parâmetro de usuário (export_my_data(); clear_my_entries(date); clear_all_financial_data()); anon e JWT sem sub recusados; Bob limpou a própria conta e a Alice permaneceu idêntica (fb0f02ab) |
| R1 | PASS | Compra parcelada estornada: Lançamentos (parcelas ativas) + estornos = consumo do gráfico, no banco real | valor cheio da compra 30.000 (o que Lançamentos mostrava) → parcelas ativas 20.000 − estorno 10.000 = 10.000, idêntico ao total do cartão no gráfico, também por categoria |
| O1 | PASS | Com opcional/pay_invoice_guard.sql: excesso e corrida são recusados, e os fluxos legítimos continuam funcionando | 5 pagamentos simultâneos de 4.000 numa fatura de 10.000 → 2 aceitos (8.000); 2.001 recusado; 2.000 quita; +1 recusado; após estorno aceita de novo; chave repetida em paralelo = 1 linha; Bob recusado |
