# NEXO — Arquitetura

## Camadas

```
Navegador ──► Server Components / Server Actions (Next.js)
                 │  valida sessão (supabase.auth.getUser) e entrada (Zod)
                 │  calcula com o motor de domínio (src/domain)
                 ▼
           Supabase (PostgREST + RPC) com o JWT do usuário
                 │  RLS: user_id = auth.uid() em todas as tabelas
                 │  FKs compostas (id, user_id): impossível ligar dados de usuários diferentes
                 │  funções SECURITY INVOKER para operações atômicas
                 ▼
           PostgreSQL: constraints, triggers adiadas, auditoria
```

- **Domínio puro** (`src/domain`): toda regra de dinheiro mora aqui, sem I/O, testada isoladamente. O mesmo código roda no servidor (dashboard, validação) e pode rodar no cliente (simulações instantâneas).
- **Banco como última barreira**: o que o domínio calcula, o banco confere — sinais por tipo de lançamento, soma exata das parcelas, transferências balanceadas, unicidade de períodos de assinatura, chaves de idempotência.
- **Sem totais redundantes**: saldos e faturas são derivados dos lançamentos. Se no futuro houver cache de saldo, será recalculado por trigger na mesma transação.

## Modelo de dados

| Entidade | Tabela | Observações |
|---|---|---|
| Usuários / perfis / preferências | `auth.users`, `profiles` | tema, fuso, reserva, margem, consentimento de notificações externas |
| Contas bancárias | `accounts` | saldo inicial + data de referência; `archived_at`; `is_demo` |
| Cartões | `cards` | só últimos 4 dígitos; dia de fechamento/vencimento; regra do dia do fechamento; regra de limite; conta padrão de pagamento |
| Ciclos de fatura | derivados + `invoice_overrides` | fatura = mês do vencimento |
| Compras e parcelas | `purchases`, `card_charges` | parcelas, estornos, créditos, ajustes, juros |
| Transações | `account_entries` | receita, despesa, transferência, pagamento de fatura, reembolso, ajuste; status realizado/agendado/previsto; exclusão controlada (`deleted_at`) |
| Transferências | `transfers` + 2 `account_entries` | atômica e balanceada |
| Pagamentos de fatura | `account_entries` (`invoice_payment`) + visão `invoice_payments` | |
| Categorias / tags | `categories` (hierárquica), `tags`, `entry_tags` | categorias padrão criadas no cadastro |
| Assinaturas | `subscriptions`, `subscription_prices`, `subscription_charges` | `UNIQUE(subscription_id, period_key)` |
| Recorrências / recebimentos previstos | `recurring_templates` + lançamentos `expected` | `UNIQUE(recurring_id, period_key)` |
| Orçamentos / metas | `budgets`, `goals`, `goal_contributions` | aporte em meta não é despesa |
| Notificações | `notifications` | `dedupe_key` evita repetição; canal externo só com consentimento |
| Importação futura | `import_batches` + `import_fingerprint` | detecção de duplicidade em CSV/OFX |
| Auditoria | `audit_log` | trigger em tabelas financeiras; somente leitura para o dono |

## Concorrência e idempotência

- Coluna `version` incrementada a cada `update` (controle otimista; `update_transfer` aceita `p_expected_version`).
- `idempotency_key` em transferências, compras e lançamentos: repetir a mesma requisição devolve o mesmo registro.
- Operações com mais de uma linha (transferência, compra parcelada, estorno, cobrança de assinatura) são funções SQL numa única transação.

## Segurança

- RLS habilitado em todas as tabelas; `anon` sem acesso.
- Server Actions revalidam a sessão no servidor; a service role só existe em `src/lib/supabase/admin.ts` (marcado `server-only`) para excluir a própria conta.
- Exclusão de conta apaga tudo por cascata a partir de `auth.users`.
- Exportação: `export_my_data()` (security invoker) devolve só os dados do usuário.
- Nota de implantação: funções de trigger `SECURITY DEFINER` (perfil inicial, auditoria) dependem do papel `postgres` do Supabase, que tem `BYPASSRLS`.

## Design system

Tokens em `src/app/globals.css`. Modo escuro: `#241127` nos fundos, `#C20F49` nos elementos interativos, `#F25C8D` para foco e destaques. Modo claro: fundos `#FBF6F9`/branco, `#241127` vira tinta e ação primária. Geist com algarismos tabulares em todos os valores. O tema é salvo no perfil (fonte de verdade) e num cookie (render sem "piscar").
