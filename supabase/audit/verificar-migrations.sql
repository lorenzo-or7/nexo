-- NEXO · Quais migrations já foram aplicadas? (SOMENTE LEITURA — pode rodar no SQL Editor de produção)
-- Cada linha testa um objeto que SÓ existe depois daquela migration. "aplicada = false" → rode a migration.
-- Rode as pendentes na ordem da coluna "migration". Não reexecute as que já estão como true.
with
  fn(n) as (select proname from pg_proc where pronamespace = 'public'::regnamespace),
  col(t, c) as (select table_name, column_name from information_schema.columns where table_schema = 'public')
select m.migration, m.arquivo, m.aplicada, m.evidencia
from (values
  ('20261008000100', 'core_schema',            to_regclass('public.accounts') is not null and to_regclass('public.audit_log') is not null, 'tabelas accounts/audit_log'),
  ('20261008000200', 'rls',                    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'accounts'), 'políticas RLS em accounts'),
  ('20261008000300', 'functions',              exists (select 1 from fn where n = 'seed_default_categories') and exists (select 1 from fn where n = 'tg_audit'), 'seed_default_categories, tg_audit'),
  ('20261008000400', 'integrity_rpc',          exists (select 1 from fn where n = 'create_credit_purchase') and exists (select 1 from fn where n = 'pay_invoice'), 'create_credit_purchase, pay_invoice'),
  ('20261009000500', 'card_images',            exists (select 1 from col where t = 'cards' and c = 'institution_key'), 'cards.institution_key'),
  ('20261009000600', 'ensure_profile',         exists (select 1 from fn where n = 'ensure_profile'), 'ensure_profile()'),
  ('20261009000700', 'accounts_entries',       exists (select 1 from fn where n = 'remove_account') and exists (select 1 from fn where n = 'set_entry_tags'), 'remove_account, set_entry_tags'),
  ('20261009000800', 'delete_purchase',        exists (select 1 from fn where n = 'delete_purchase'), 'delete_purchase()'),
  ('20261009000900', 'reimbursements',         exists (select 1 from fn where n = 'add_reimbursement'), 'add_reimbursement()'),
  ('20261009001000', 'categories',             exists (select 1 from fn where n = 'remove_category') and exists (select 1 from fn where n = 'tg_category_rules'), 'remove_category, tg_category_rules'),
  ('20261010001100', 'subscriptions',          exists (select 1 from fn where n = 'save_subscription') and exists (select 1 from col where t = 'subscriptions' and c = 'charged_through'), 'save_subscription, subscriptions.charged_through'),
  ('20261016001200', 'fixed_income',           to_regclass('public.fixed_incomes') is not null and exists (select 1 from fn where n = 'record_fixed_income_entry'), 'tabela fixed_incomes'),
  ('20261016001300', 'profile_palette',        exists (select 1 from col where t = 'profiles' and c = 'palette'), 'profiles.palette'),
  ('20261017001400', 'fixed_bills',            exists (select 1 from col where t = 'subscriptions' and c = 'kind'), 'subscriptions.kind'),
  ('20261027001500', 'fixed_income_lifecycle', exists (select 1 from col where t = 'fixed_incomes' and c = 'deleted_at') and exists (select 1 from fn where n = 'end_fixed_income'), 'fixed_incomes.deleted_at, end_fixed_income'),
  ('20261027001600', 'invoice_payment_reversal', exists (select 1 from fn where n = 'reverse_invoice_payment'), 'reverse_invoice_payment()'),
  ('20261027001700', 'data_management',       exists (select 1 from col where t = 'fixed_incomes' and c = 'cleared_before') and exists (select 1 from fn where n = 'clear_all_financial_data'), 'fixed_incomes.cleared_before, clear_*'),
  ('20261028000100', 'pay_invoice_guard',      exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'pay_invoice' and prosrc like '%nexo.invpay%'), 'pay_invoice com trava e limite do devido'),
  ('20261028000200', 'wipe_hardening',         exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_wipe_finish' and pronargs = 2) and not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = '_wipe_finish' and pronargs = 1), '_wipe_finish(uuid, boolean) sem marcador de sessão')
) as m(migration, arquivo, aplicada, evidencia)
order by m.migration;
