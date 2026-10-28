# NEXO — Homologação final (28/10/2026) — 2ª rodada, com a migration 20261028000100

Nada foi publicado, nenhuma migration foi executada em produção e nenhum dado real foi tocado. Dados fictícios (usuários Alice e Bob). Todos os números abaixo vêm das execuções desta rodada.

## Resultado geral: **PASS**

| Verificação | Resultado |
|---|---|
| TypeScript (`tsc`) | PASS, 0 erros |
| ESLint | PASS, 0 erros e 0 avisos |
| Vitest (domínio, banco em PGlite, actions) | PASS, 195 de 195 (18 arquivos) |
| `next build` | PASS |
| Playwright desktop + celular, suíte completa | PASS: 172 passaram, 4 ignorados (testes só de celular), 0 falhas |
| Postgres 16 real com papéis estilo Supabase (`supabase/audit`) | 32 PASS, 2 WARN, 1 INFO, 0 FAIL |

## O que mudou nesta rodada
1. **Migration oficial `20261028000100_pay_invoice_guard.sql`** (antes opcional): `pay_invoice` agora
   - confere explicitamente que cartão e conta são do usuário (conta não arquivada);
   - aceita só `confirmed` ou `scheduled`, valor positivo, fatura `AAAA-MM`, data e chave de até 100 caracteres;
   - serializa pagamentos por cartão + fatura (advisory lock) e recusa valor maior que o restante (soma das parcelas ativas − pagamentos ativos, confirmados ou agendados) e fatura já quitada;
   - torna a idempotência consistente: mesma chave + mesmo pedido = mesmo pagamento; pedido diferente, chave de outra operação ou de pagamento estornado = erro.
   - Correção encontrada durante os testes: os erros de idempotência usavam SQLSTATE 23505 e caíam no próprio handler de `unique_violation`; passaram a 22023.
2. **Exclusão definitiva da conta reforçada:** exige a frase `EXCLUIR MINHA CONTA` (a antiga `EXCLUIR` não vale mais), o aceite explícito e a senha atual, conferida contra o e-mail da sessão; só então chama o Auth. A tela habilita o botão apenas com os três.
3. O app mostra mensagens claras quando o banco recusa excesso, fatura quitada ou chave reutilizada.
4. `docs/REGRAS-FINANCEIRAS.md` atualizado: pagamento a maior passou de "vira crédito" para "recusado".
5. **Endurecimento de privilégios continua opcional, separado e NÃO aplicado:** `supabase/audit/opcional/endurecimento.sql`.

## Pagamento de fatura: evidências (Postgres real)
- P1 propriedade, P2 status/valor/fatura/data, P3 idempotência (inclui 4 requisições simultâneas com a mesma chave → 1 vencedor), P4 concorrência (20×1.000 numa fatura de 10.000 → exatamente 10 aceitos; 6×4.000 → 2 aceitos; estorno + pagamentos simultâneos nunca passam de 10.000), P5 matriz (parcial, integral, excedente, quitada, estorno, novo pagamento).
- **Teste de mutação:** removendo a trava da função, P4 passa a FALHAR; com a trava, passa. Ou seja, o teste detecta a regressão.
- 12 testes novos no PGlite (sequenciais) e 4 na action de exclusão de conta; 1 e2e novo da tela de exclusão.

## Itens que continuam como risco / limite
- **WARN S10 / S5:** privilégios padrão do Supabase (TRUNCATE/REFERENCES/TRIGGER para `authenticated`; auxiliares executáveis por anon). Sem efeito pela API; correção opcional pronta e testada (S11), à sua escolha.
- O app considera só pagamentos **confirmados** ao mostrar o "restante"; o banco conta também os **agendados** (mais rígido, evita agendar duas vezes). Nesse caso a tela mostra a mensagem de excesso.
- Auth, SMTP, política de senha e limite de tentativas do projeto Supabase real não foram provados aqui; o estado atual do banco de produção só se confirma com `verificar-migrations.sql`.
- A reautenticação por senha não existe para quem entra sem senha (se houver login social no futuro, precisará de outro fluxo).

## Evidências do banco (35 verificações)
| ID | Status | Verificação | Evidência |
|---|---|---|---|
| M1 | PASS | Nomes no padrão do Supabase, versões únicas, em ordem estritamente crescente | 18 migrations, de 20261008000100 a 20261028000100: 20261008000100, 20261008000200, 20261008000300, 20261008000400, 20261009000500, 20261009000600, 20261009000700, 20261009000800, 20261009000900, 20261009001000, 20261010001100, 20261016001200, 20261016001300, 20261017001400, 20261027001500, 20261027001600, 20261027001700, 20261028000100 |
| M2 | PASS | Todas aplicam em sequência num banco vazio com papéis/privilégios estilo Supabase | 18/18 aplicadas sem erro no PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1); 22 tabelas, 40 funções em public |
| M3 | INFO | Reaplicar cada migration sobre o banco já migrado (quais são seguras para rodar de novo) | Reaplicáveis sem erro: 20261009000600, 20261009000800, 20261010001100, 20261016001300, 20261017001400, 20261027001500, 20261027001600, 20261027001700, 20261028000100. NÃO reexecutar (falham se já aplicadas): 20261008000100 (type "cents" already exists); 20261008000200 (policy "accounts_owner" for table "accounts" already exists); 20261008000300 (trigger "on_auth_user_created" for relation "users"  |
| M4 | PASS | Atualização com dados fictícios: estado anterior (até 20261017001400) + as 4 novas migrations preservam os dados | 4 migrations novas aplicadas sobre dados existentes; contagens de 21 tabelas idênticas para os 2 usuários; remove_fixed_income = deleted_with_history |
| M5 | PASS | Script de detecção (somente leitura) identifica corretamente quais migrations já foram aplicadas | banco completo: 18/18 detectadas; banco parcial: faltam exatamente 20261027001500, 20261027001600, 20261027001700, 20261028000100 |
| S1 | PASS | RLS ligada em todas as tabelas de public e nenhuma política 'aberta' (using true) | 22 tabelas com RLS, 23 políticas, todas restritas a authenticated e filtrando por auth.uid() |
| S2 | PASS | anon não tem nenhum privilégio em tabelas/views de public | 0 privilégios de anon em 24 relações |
| S3 | PASS | Views usam security_invoker (RLS do usuário continua valendo) | views: invoice_payments, account_balances |
| S4 | PASS | Funções SECURITY DEFINER: search_path fixo, e nenhuma aceita um id de usuário vindo do cliente | 8 definers: _wipe_finish[authenticated], check_transfer[interna], ensure_profile[authenticated], handle_new_user[trigger], seed_default_categories[interna], tg_audit[trigger], tg_entries_transfer[trigger], tg_transfers_row[trigger] |
| S5 | WARN | Permissão EXECUTE: nenhuma RPC de negócio é executável por anon/PUBLIC; todas são por authenticated | 31 RPCs de negócio: 0 para anon. Auxiliares/gatilhos ainda executáveis por anon/PUBLIC (privilégio padrão do Postgres; sem efeito, pois exigem contexto de gatilho ou sessão): fixed_income_date, handle_new_user, require_user, tg_audit, tg_category_kind_cascade, tg_category_rules, tg_entries_transfer, tg_touch, tg_transfers_row. Recomendação: revogar (ver opcional/endurecimento.sql). |
| S6 | PASS | Gatilhos SECURITY DEFINER não podem ser chamados diretamente como função | handle_new_user: trigger functions can only be called as triggers / tg_audit: trigger functions can only be called as triggers / tg_entries_transfer: trigger functions can only be called as triggers / tg_transfers_row: trigger functions can only be called as triggers |
| S7 | PASS | _wipe_finish (definer) recusa chamada direta de usuário logado e de anon | sem marcador: "Operação não permitida"; anon: "permission denied for function _wipe_fin"; com marcador forjado por Alice, o Bob permanece idêntico (impressão 14d5c570) |
| S8 | PASS | seed_default_categories(uuid) (definer) não é executável por usuários (impede criar categorias na conta de outro) | permission denied for function seed_default_categories |
| S9 | PASS | authenticated não consegue forjar nem alterar a auditoria (audit_log) | insert negado; update e delete afetam 0 linhas (RLS só permite SELECT) |
| S10 | WARN | Privilégios de tabela além do necessário para authenticated (TRUNCATE/REFERENCES/TRIGGER) | 22 tabelas concedem trigger/references/truncate a authenticated (privilégio padrão do Supabase: ALTER DEFAULT PRIVILEGES ... GRANT ALL). Não é alcançável pela API REST (não existe verbo TRUNCATE) e RLS cobre select/insert/update/delete, mas TRUNCATE ignora RLS se alguém obtiver SQL direto. Recomendação: opcional/endurecimento.sql. |
| S11 | PASS | Endurecimento opcional (revogar extras) não quebra nada: RPCs principais continuam funcionando | extras revogados (0 restantes); seed completo, pay_invoice, export_my_data e clear_my_entries OK no banco endurecido |
| F1 | PASS | Leitura: cada usuário vê exatamente as próprias linhas em todas as tabelas e views | 21 tabelas + 2 views: 0 linhas de outro usuário visíveis (A:83 linhas, B:83) |
| F2 | PASS | Escrita cruzada: Bob não consegue usar, alterar nem apagar nada da Alice (ids reais da Alice) | 21 tentativas do Bob com ids da Alice: todas recusadas; impressão da Alice inalterada (9c70e851) |
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
| F9 | PASS | Limpar lançamentos (Alice): zera movimentações, preserva cadastros, não toca no Bob | removido: {"entries":28,"purchases":2,"transfers":1,"card_charges":6,"subscription_charges":0}; cadastros preservados; Bob idêntico (735a429b); marcador de recomeço gravado; auditoria dos lançamentos limpa |
| F10 | PASS | Atomicidade: se um passo da limpeza total falha, NADA é apagado | erro "falha injetada" no meio das duas funções → 22 tabelas da Alice e do Bob idênticas (rollback total) |
| F11 | PASS | Limpar tudo: execução dupla simultânea é segura (sem deadlock, sem estado parcial, sem tocar no Bob) | 2 execuções simultâneas concluídas sem erro (advisory lock por usuário); Bob idêntico |
| F12 | PASS | Limpar tudo: não sobra NENHUM dado financeiro da Alice em nenhuma tabela; login e preferências ficam | 21 tabelas verificadas dinamicamente; só restam as 42 categorias padrão; auth.users e profiles preservados (tema dark, fuso America/Sao_Paulo); a conta continua utilizável (42 categorias visíveis) |
| F13 | PASS | Reautenticação/identidade: limpeza usa só o JWT; o Bob limpando não afeta a Alice e anon/sem sessão não limpa nada | assinaturas sem parâmetro de usuário (export_my_data(); clear_my_entries(date); clear_all_financial_data()); anon e JWT sem sub recusados; Bob limpou a própria conta e a Alice permaneceu idêntica (b5481f92) |
| R1 | PASS | Compra parcelada estornada: Lançamentos (parcelas ativas) + estornos = consumo do gráfico, no banco real | valor cheio da compra 30.000 (o que Lançamentos mostrava) → parcelas ativas 20.000 − estorno 10.000 = 10.000, idêntico ao total do cartão no gráfico, também por categoria |
