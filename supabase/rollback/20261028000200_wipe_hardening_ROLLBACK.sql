-- NEXO · ROLLBACK DE EMERGÊNCIA da migration 20261028000200 (wipe_hardening). NÃO é migration. NÃO rode sem necessidade.
-- Restaura o desenho anterior (marcador de sessão `nexo.wiping` + _wipe_finish(boolean) definer), que é MENOS seguro.
-- O app não precisa de rollback de código por causa disto: os nomes e retornos de clear_my_entries e
-- clear_all_financial_data são os mesmos nas duas versões. Só use se a limpeza de dados parar de funcionar em produção.
begin;
drop function if exists public._wipe_finish(uuid, boolean);
create or replace function public._wipe_finish(p_all boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null or coalesce(current_setting('nexo.wiping', true), '') <> '1' then
    raise exception 'Operação não permitida' using errcode = '42501';
  end if;
  if p_all then
    delete from public.audit_log where user_id = uid;
    perform public.seed_default_categories(uid);
  else
    delete from public.audit_log where user_id = uid
      and table_name in ('account_entries', 'transfers', 'purchases', 'card_charges');
  end if;
end $$;
revoke all on function public._wipe_finish(boolean) from public, anon;
grant execute on function public._wipe_finish(boolean) to authenticated;

-- =============================================================== limpar só os lançamentos
-- Apaga lançamentos, transferências, compras no cartão, parcelas, pagamentos de fatura e o histórico
-- de cobranças recorrentes. Mantém contas, cartões, categorias, assinaturas, contas fixas, rendas fixas,
-- metas e preferências. Marca o "recomeço" para que nada do passado seja recriado pelas recorrências.
create or replace function public.clear_my_entries(p_today date) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  n_entries bigint; n_transfers bigint; n_purchases bigint; n_charges bigint; n_sub_charges bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexo.wipe:' || uid::text, 0));
  perform set_config('nexo.wiping', '1', true);

  -- impede que assinaturas e rendas fixas recriem o que já passou
  update public.subscriptions set charged_through = greatest(coalesce(charged_through, p_today), p_today) where user_id = uid;
  update public.fixed_incomes set cleared_before = greatest(coalesce(cleared_before, p_today), p_today) where user_id = uid;

  delete from public.account_entries where user_id = uid;       get diagnostics n_entries = row_count;
  delete from public.transfers where user_id = uid;             get diagnostics n_transfers = row_count;
  delete from public.card_charges where user_id = uid;          get diagnostics n_charges = row_count;
  delete from public.purchases where user_id = uid;             get diagnostics n_purchases = row_count;
  delete from public.subscription_charges where user_id = uid;  get diagnostics n_sub_charges = row_count;

  perform public._wipe_finish(false);
  return jsonb_build_object('entries', n_entries, 'transfers', n_transfers, 'card_charges', n_charges,
                            'purchases', n_purchases, 'subscription_charges', n_sub_charges);
end $$;

-- =============================================================== limpar TODOS os dados financeiros
-- Remove contas, cartões, faturas, lançamentos, rendas fixas, contas fixas, assinaturas, metas,
-- orçamentos, categorias e subcategorias (as padrão voltam), tags e o histórico de auditoria.
-- Mantém o login (Supabase Auth), o perfil e as preferências (tema, paleta, fuso, nome).
create or replace function public.clear_all_financial_data() returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  n jsonb := '{}'::jsonb;
  c bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexo.wipe:' || uid::text, 0));
  perform set_config('nexo.wiping', '1', true);

  -- ordem respeita as chaves (filhos antes dos pais); tudo na mesma transação
  delete from public.goal_contributions where user_id = uid;
  delete from public.goals where user_id = uid;                 get diagnostics c = row_count; n := n || jsonb_build_object('goals', c);
  delete from public.budgets where user_id = uid;
  delete from public.account_entries where user_id = uid;       get diagnostics c = row_count; n := n || jsonb_build_object('entries', c);
  delete from public.transfers where user_id = uid;
  delete from public.card_charges where user_id = uid;
  delete from public.purchases where user_id = uid;
  delete from public.subscription_charges where user_id = uid;
  delete from public.subscription_prices where user_id = uid;
  delete from public.subscriptions where user_id = uid;         get diagnostics c = row_count; n := n || jsonb_build_object('subscriptions', c);
  delete from public.fixed_incomes where user_id = uid;         get diagnostics c = row_count; n := n || jsonb_build_object('fixed_incomes', c);
  delete from public.recurring_templates where user_id = uid;
  delete from public.invoice_overrides where user_id = uid;
  delete from public.import_batches where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.cards where user_id = uid;                 get diagnostics c = row_count; n := n || jsonb_build_object('cards', c);
  delete from public.accounts where user_id = uid;              get diagnostics c = row_count; n := n || jsonb_build_object('accounts', c);
  delete from public.tags where user_id = uid;
  delete from public.categories where user_id = uid;

  perform public._wipe_finish(true);
  return n;
end $$;


-- as funções de limpeza antigas eram SECURITY INVOKER
revoke all on function public.clear_my_entries(date) from public, anon;
revoke all on function public.clear_all_financial_data() from public, anon;
grant execute on function public.clear_my_entries(date) to authenticated;
grant execute on function public.clear_all_financial_data() to authenticated;
notify pgrst, 'reload schema';
commit;
