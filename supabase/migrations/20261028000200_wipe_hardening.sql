-- NEXO · Endurecimento da limpeza de dados (substitui o desenho com marcador de sessão).
--
-- Problema: `_wipe_finish(boolean)` era SECURITY DEFINER, executável por `authenticated` e protegida só por
-- uma variável de sessão (`nexo.wiping`). Uma variável de sessão não é autorização: quem controla a conexão
-- consegue forjá-la. O alcance era limitado ao PRÓPRIO usuário (auth.uid()), mas ainda permitia apagar o
-- próprio histórico de auditoria e recriar categorias fora do fluxo de limpeza.
--
-- Solução (privilégio mínimo):
--   1. `_wipe_finish` deixa de ser definer e perde TODA permissão de execução para anon/authenticated/PUBLIC.
--      Só o dono do banco consegue chamá-la — ou seja, só as funções de limpeza abaixo.
--   2. As duas funções de limpeza passam a ser o único ponto de entrada. Elas são SECURITY DEFINER (para poder
--      limpar a auditoria, que o usuário não pode alterar), mas a autorização vem de `auth.uid()` (JWT validado
--      pelo Supabase), e TODO comando filtra `user_id = uid`. Sem sessão válida: erro 28000.
--   3. Não existe mais marcador de sessão a forjar.
--   4. Cada chamada é uma transação: qualquer falha desfaz tudo.
-- Nada muda para o app: mesmos nomes, parâmetros e retornos de `clear_my_entries` e `clear_all_financial_data`.

drop function if exists public._wipe_finish(boolean);

create or replace function public._wipe_finish(p_user uuid, p_all boolean) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_user is null then raise exception 'Usuário obrigatório' using errcode = '22023'; end if;
  if p_all then
    delete from public.audit_log where user_id = p_user;
    perform public.seed_default_categories(p_user);
  else
    delete from public.audit_log where user_id = p_user
      and table_name in ('account_entries', 'transfers', 'purchases', 'card_charges');
  end if;
end $$;
revoke all on function public._wipe_finish(uuid, boolean) from public, anon, authenticated;

create or replace function public.clear_my_entries(p_today date) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := public.require_user();
  n_entries bigint; n_transfers bigint; n_purchases bigint; n_charges bigint; n_sub_charges bigint;
begin
  if p_today is null then raise exception 'Data obrigatória' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('nexo.wipe:' || uid::text, 0));

  update public.subscriptions set charged_through = greatest(coalesce(charged_through, p_today), p_today) where user_id = uid;
  update public.fixed_incomes set cleared_before = greatest(coalesce(cleared_before, p_today), p_today) where user_id = uid;

  delete from public.account_entries where user_id = uid;       get diagnostics n_entries = row_count;
  delete from public.transfers where user_id = uid;             get diagnostics n_transfers = row_count;
  delete from public.card_charges where user_id = uid;          get diagnostics n_charges = row_count;
  delete from public.purchases where user_id = uid;             get diagnostics n_purchases = row_count;
  delete from public.subscription_charges where user_id = uid;  get diagnostics n_sub_charges = row_count;

  perform public._wipe_finish(uid, false);
  return jsonb_build_object('entries', n_entries, 'transfers', n_transfers, 'card_charges', n_charges,
                            'purchases', n_purchases, 'subscription_charges', n_sub_charges);
end $$;

create or replace function public.clear_all_financial_data() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := public.require_user();
  n jsonb := '{}'::jsonb;
  c bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('nexo.wipe:' || uid::text, 0));

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

  perform public._wipe_finish(uid, true);
  return n;
end $$;

-- Somente usuário logado executa os pontos de entrada.
revoke all on function public.clear_my_entries(date) from public, anon;
revoke all on function public.clear_all_financial_data() from public, anon;
grant execute on function public.clear_my_entries(date) to authenticated;
grant execute on function public.clear_all_financial_data() to authenticated;
notify pgrst, 'reload schema';
