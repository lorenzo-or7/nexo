# NEXO · Validação local OPCIONAL (PowerShell + Docker). NÃO toca em produção e NÃO altera nexo_restore/nexo_comparacao.
# Cria uma cópia nexo_teste_0200 de nexo_restore, aplica a migration 20261028000200 e roda as verificações.
# Execute na pasta do pacote (a que contém 02-SUPABASE-executar e 03-DIAGNOSTICO-somente-leitura).
# ATENÇÃO: não foi executado pelo autor (sem acesso ao seu Docker).
$ErrorActionPreference = "Stop"
$c = "supabase_db_NEXO-Backup"
function Psql($db, $sqlFile) { Get-Content -Raw -Encoding UTF8 $sqlFile | docker exec -i $c psql -U postgres -d $db -v ON_ERROR_STOP=1 -X }

docker exec $c psql -U postgres -X -c "drop database if exists nexo_teste_0200" | Out-Null
docker exec $c psql -U postgres -X -c "create database nexo_teste_0200 template nexo_restore"   # falha se houver conexões abertas em nexo_restore
Write-Host "== aplicando 20261028000200 na CÓPIA =="
Psql "nexo_teste_0200" ".\02-SUPABASE-executar\20261028000200_wipe_hardening.sql"
Write-Host "== verificar-migrations (esperado: tudo true) =="
Psql "nexo_teste_0200" ".\03-DIAGNOSTICO-somente-leitura\verificar-migrations.sql"
Write-Host "== verificar-seguranca (esperado: ok = t em todas) =="
Psql "nexo_teste_0200" ".\03-DIAGNOSTICO-somente-leitura\verificar-seguranca.sql"
Write-Host "Concluído. Para apagar a cópia: docker exec $c psql -U postgres -c 'drop database nexo_teste_0200'"
