-- NEXO · Endurecimento OPCIONAL de privilégios (defesa em profundidade). NÃO faz parte das migrations.
-- No Supabase, objetos novos em public já nascem com TODOS os privilégios para anon/authenticated/service_role
-- (ALTER DEFAULT PRIVILEGES). As migrations revogam o necessário de anon e liberam só select/insert/update/delete
-- para authenticated, mas sobram TRUNCATE, REFERENCES e TRIGGER. A API REST não expõe TRUNCATE e a RLS cobre os
-- outros comandos, então isto não é explorável pela aplicação — é só reduzir a superfície caso alguém obtenha SQL direto.
-- Efeito: nenhum na aplicação. Testado em supabase/audit/run-audit.mjs (S11).

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Auxiliares e gatilhos não precisam ser executáveis por anon/PUBLIC (os gatilhos continuam funcionando:
-- quem dispara é o Postgres, não o papel que chama).
do $$
declare f text;
begin
  foreach f in array array['handle_new_user()', 'tg_audit()', 'tg_entries_transfer()', 'tg_transfers_row()',
                           'tg_category_rules()', 'tg_category_kind_cascade()', 'tg_touch()', 'fixed_income_date(text,integer)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
