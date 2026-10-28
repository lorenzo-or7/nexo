# Homologação do banco (Postgres real, descartável)

Este kit valida as migrations do NEXO num Postgres **de teste** com papéis e privilégios no estilo Supabase
(`anon`, `authenticated`, `service_role`, `authenticator`, `ALTER DEFAULT PRIVILEGES ... GRANT ALL`, `auth.uid()` lendo o JWT).
Cada chamada simula uma requisição do PostgREST: uma transação, `SET LOCAL ROLE`, claims do JWT.

**Nunca aponte para produção** — o script cria e apaga bancos `nexo_audit_*`.

```bash
# 1) um Postgres 15+ qualquer, como superusuário (ex.: initdb + pg_ctl, ou Docker)
# 2) o driver (sem alterar o package.json)
npm i --no-save pg
# 3) rodar tudo, ou uma parte: migrations | security | functional | recon
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres node supabase/audit/run-audit.mjs
```

Saída: tabela PASS / FAIL / WARN / INFO e `last-report.json`. Código de saída 1 se houver FAIL.

| Arquivo | Para quê |
|---|---|
| `bootstrap.sql` | cria papéis, `auth`, `storage` e privilégios padrão como no Supabase |
| `run-audit.mjs` | as verificações (migrations, segurança, dois usuários, concorrência) |
| `verificar-migrations.sql` | **somente leitura**: diz quais migrations já estão aplicadas (pode rodar em produção) |
| `verificar-seguranca.sql` | **somente leitura**: 10 verificações de privilégio/RLS/funções definer após aplicar as migrations (tudo deve dar `true`) |
| `opcional/endurecimento.sql` | **opcional, não é migration e nunca é aplicado automaticamente**: revoga privilégios sobrando (TRUNCATE/REFERENCES/TRIGGER) e execução de gatilhos por anon. Testado em S11 |

O que **não** dá para provar aqui: o painel/Auth reais do seu projeto (política de senha, SMTP, rate limit),
o PostgREST de verdade e o estado atual do seu banco de produção — para o último, use `verificar-migrations.sql`.
