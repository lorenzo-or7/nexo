-- NEXO · Gerenciamento de dados (LGPD): exportar, limpar lançamentos, limpar tudo.
-- Tudo transacional (uma chamada = uma transação: ou apaga tudo, ou nada), só do usuário logado
-- (RLS + filtro explícito user_id = auth.uid()), e sem chave service_role.

-- Marcador de "recomeço": a renda fixa não recria os meses anteriores a esta data depois da limpeza.
alter table public.fixed_incomes add column if not exists cleared_before date;

-- =============================================================== exportação
create or replace function public.export_my_data() returns jsonb
language plpgsql security invoker stable set search_path = public as $$
declare uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'format_version', 2,
    -- só preferências do perfil; nunca senhas, tokens ou chaves (isso fica no Supabase Auth)
    'profile', (select jsonb_build_object('display_name', p.display_name, 'timezone', p.timezone, 'theme', p.theme,
                  'reserve_cents', p.reserve_cents, 'safety_margin_cents', p.safety_margin_cents,
                  'include_expected_income', p.include_expected_income) from public.profiles p where p.id = uid),
    'accounts', coalesce((select jsonb_agg(to_jsonb(x)) from public.accounts x where x.user_id = uid), '[]'),
    'cards', coalesce((select jsonb_agg(to_jsonb(x)) from public.cards x where x.user_id = uid), '[]'),
    'invoice_overrides', coalesce((select jsonb_agg(to_jsonb(x)) from public.invoice_overrides x where x.user_id = uid), '[]'),
    'categories', coalesce((select jsonb_agg(to_jsonb(x)) from public.categories x where x.user_id = uid), '[]'),
    'tags', coalesce((select jsonb_agg(to_jsonb(x)) from public.tags x where x.user_id = uid), '[]'),
    'transfers', coalesce((select jsonb_agg(to_jsonb(x)) from public.transfers x where x.user_id = uid), '[]'),
    'entries', coalesce((select jsonb_agg(to_jsonb(x)) from public.account_entries x where x.user_id = uid), '[]'),
    'purchases', coalesce((select jsonb_agg(to_jsonb(x)) from public.purchases x where x.user_id = uid), '[]'),
    'card_charges', coalesce((select jsonb_agg(to_jsonb(x)) from public.card_charges x where x.user_id = uid), '[]'),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscriptions x where x.user_id = uid), '[]'),
    'subscription_prices', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscription_prices x where x.user_id = uid), '[]'),
    'subscription_charges', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscription_charges x where x.user_id = uid), '[]'),
    'fixed_incomes', coalesce((select jsonb_agg(to_jsonb(x)) from public.fixed_incomes x where x.user_id = uid), '[]'),
    'recurring_templates', coalesce((select jsonb_agg(to_jsonb(x)) from public.recurring_templates x where x.user_id = uid), '[]'),
    'budgets', coalesce((select jsonb_agg(to_jsonb(x)) from public.budgets x where x.user_id = uid), '[]'),
    'goals', coalesce((select jsonb_agg(to_jsonb(x)) from public.goals x where x.user_id = uid), '[]'),
    'goal_contributions', coalesce((select jsonb_agg(to_jsonb(x)) from public.goal_contributions x where x.user_id = uid), '[]')
  );
end $$;

-- =============================================================== etapa final da limpeza (definer, restrita)
-- A auditoria guarda cópia dos dados apagados (old_data), então ela também precisa ser limpa; e,
-- depois de apagar todas as categorias, as padrão voltam. Só funciona DENTRO das funções de limpeza
-- (marcador local da transação) e só para o usuário logado.
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

do $$
declare f text;
begin
  foreach f in array array['export_my_data()', 'clear_my_entries(date)', 'clear_all_financial_data()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
