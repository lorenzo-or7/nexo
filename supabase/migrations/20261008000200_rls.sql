-- NEXO · Row Level Security
-- Regra única: cada usuário só enxerga e altera linhas com user_id = auth.uid().
-- O servidor (server actions) também valida a sessão antes de qualquer operação.
-- A chave service_role NUNCA é usada no navegador.

do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts', 'categories', 'tags', 'cards', 'invoice_overrides', 'transfers',
    'recurring_templates', 'account_entries', 'entry_tags', 'purchases', 'card_charges',
    'subscriptions', 'subscription_prices', 'subscription_charges', 'budgets', 'goals',
    'goal_contributions', 'notifications', 'import_batches'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I for all to authenticated
                     using (user_id = (select auth.uid()))
                     with check (user_id = (select auth.uid()))$p$, t || '_owner', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- perfil: id é o próprio usuário; não pode ser criado nem apagado pelo cliente
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select, update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- auditoria: somente leitura para o dono; escrita apenas por trigger (security definer)
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated using (user_id = (select auth.uid()));
grant select on public.audit_log to authenticated;
revoke all on public.audit_log from anon;

grant select on public.invoice_payments, public.account_balances to authenticated;
revoke all on public.invoice_payments, public.account_balances from anon;
