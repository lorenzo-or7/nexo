-- NEXO · Verificação de segurança pós-migrations (SOMENTE LEITURA — pode rodar no SQL Editor).
-- Cada linha deve mostrar ok = true. Qualquer false: não publique e me envie a tabela.
select * from (values
  ('_wipe_finish existe só na versão (uuid, boolean)',
    (select count(*) = 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_wipe_finish' and pronargs = 2)
    and not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_wipe_finish' and pronargs = 1)),
  ('_wipe_finish NÃO é executável por anon/authenticated/PUBLIC',
    (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
                     and not has_function_privilege('public', p.oid, 'execute'))
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_wipe_finish')),
  ('_wipe_finish não é SECURITY DEFINER',
    (select bool_and(not p.prosecdef) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = '_wipe_finish')),
  ('clear_my_entries/clear_all_financial_data: authenticated executa, anon não',
    (select bool_and(has_function_privilege('authenticated', p.oid, 'execute') and not has_function_privilege('anon', p.oid, 'execute'))
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('clear_my_entries', 'clear_all_financial_data'))),
  ('clear_* são SECURITY DEFINER com search_path fixo e não usam marcador de sessão',
    (select bool_and(p.prosecdef and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%') and p.prosrc not like '%nexo.wiping%')
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('clear_my_entries', 'clear_all_financial_data'))),
  ('nenhuma função SECURITY DEFINER de public sem search_path fixo',
    not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
                  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))),
  ('seed_default_categories NÃO é executável por usuários',
    (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute'))
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'seed_default_categories')),
  ('pay_invoice: anon não executa, authenticated executa, com trava de concorrência',
    (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute') and p.prosrc like '%nexo.invpay%')
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'pay_invoice')),
  ('RLS ligada em todas as tabelas de public',
    not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity)),
  ('anon sem privilégio em tabelas de public',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'))
) as t(verificacao, ok);
