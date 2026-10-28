# NEXO — Como publicar (ordem exata)

**Nada disto foi executado por mim em produção.** Faça só depois de decidir publicar. Tudo é feito por você (ou com orientação).

## Conteúdo do pacote
| Pasta | O que é | Quando usar |
|---|---|---|
| `01-VERCEL-aplicativo/` | `nexo-atualizacao.patch` (código completo desta atualização, 12 commits sobre a `main`) | aplicar em uma branch e publicar |
| `02-SUPABASE-executar/` | as migrations pendentes, uma por arquivo, **na ordem do nome**, e o arquivo único com todas | executar no SQL Editor do Supabase de produção, só as pendentes |
| `03-DIAGNOSTICO-somente-leitura/` | `verificar-migrations.sql`, `verificar-seguranca.sql`, `validar-no-docker-local.ps1` | antes e depois; não alteram dados |
| `04-OPCIONAL-NAO-EXECUTAR/` | `endurecimento.sql` | só se decidir; **não é migration** |
| `05-ROLLBACK-emergencia/` | rollback da migration `20261028000200` | só em emergência |
| `docs/` | relatório, regras financeiras | leitura |

## Passo a passo
1. **Backup novo** do Supabase de produção (o seu em `C:\NEXO-Backup` serve se for recente). Não sobrescreva o antigo.
2. **Diagnóstico:** rode `verificar-migrations.sql` no SQL Editor. Ele diz `aplicada = true/false` por migration. Execute **somente as que estiverem `false`**, na ordem.
   - Produção sem nenhuma das 4 novas: execute 5 arquivos, na ordem `20261027001500` → `20261027001600` → `20261027001700` → `20261028000100` → `20261028000200` (ou o arquivo único `TODAS-AS-5-em-ordem.sql`).
   - Banco que já tem as 4 (como o seu `nexo_restore`): só `20261028000200`.
   - Cada arquivo é uma execução separada. Se algum der erro, **pare** e me envie a mensagem; não pule para o próximo.
3. **Verificação de segurança:** rode `verificar-seguranca.sql`. Todas as linhas devem mostrar `ok = t` (true). Rode `verificar-migrations.sql` de novo: tudo `true`.
4. **Código (Vercel), em branch de preview:**
   ```
   git checkout main
   git checkout -b atualizacao-2026-10-28
   git am nexo-atualizacao.patch
   git push -u origin atualizacao-2026-10-28
   ```
   A Vercel gera um deploy de **preview** da branch. Teste nele: Cartões (pagamento parcial, agendado, estorno), Configurações (limpar lançamentos, limpar tudo, excluir conta pede frase + senha), Lançamentos e o gráfico.
5. **Só depois** promova (merge na `main`/Promote). Com a migration `20261028000200` já aplicada, código novo e antigo funcionam (mesmas assinaturas das funções de limpeza).

Ordem importa: **banco primeiro, código depois.** O código novo só lê dados que já existiam e chama funções com os mesmos nomes; as migrations são aditivas, então o banco novo com código antigo também funciona (sem a tela de agendado).

## Rollback
| O que | Como |
|---|---|
| **Código** | No Vercel, "Promote" o deploy anterior (instantâneo). Ou `git revert` do merge. |
| **Banco, `20261028000200`** | Normalmente desnecessário (funções com a mesma assinatura). Se a limpeza falhar: `05-ROLLBACK-emergencia/20261028000200_wipe_hardening_ROLLBACK.sql` (volta ao desenho anterior, menos seguro). |
| **Banco, demais migrations** | Não há rollback automático. Aditivas (colunas/funções novas). Para voltar de verdade, restaure o backup. Por isso o passo 1. |

## Validar no seu Docker (opcional, só quando quiser)
`03-DIAGNOSTICO-somente-leitura/validar-no-docker-local.ps1` cria uma **cópia** (`nexo_teste_0200`) do seu `nexo_restore`, aplica a `20261028000200` nela e roda as duas verificações. Não altera `nexo_restore` nem `nexo_comparacao`. **Eu não executei esse script** (não tenho acesso ao seu Docker); ele foi escrito para o contêiner `supabase_db_NEXO-Backup`. Se algo falhar, me mande a saída.
