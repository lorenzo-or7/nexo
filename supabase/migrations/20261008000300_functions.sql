-- NEXO · funções transacionais, integridade e auditoria
-- Todas as funções chamadas pelo cliente são SECURITY INVOKER: o RLS continua valendo.

-- =============================================================== novo usuário
create or replace function public.seed_default_categories(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  groups jsonb := '[
    {"name":"Transporte","kind":"expense","icon":"bus","children":["Transporte público","Ônibus","Uber e aplicativos","Combustível","Estacionamento","Outros"]},
    {"name":"Colecionáveis e hobbies","kind":"expense","icon":"gem","children":["Cartas Pokémon","Boosters","Produtos lacrados","Acessórios de coleção","Jogos","Outros hobbies"]},
    {"name":"Assinaturas","kind":"expense","icon":"repeat","children":["Inteligência artificial","Streaming","Música","Jogos","Software","Serviços digitais"]},
    {"name":"Despesas gerais","kind":"expense","icon":"shopping-bag","children":["Alimentação","Mercado","Saúde","Educação","Academia","Compras","Lazer","Presentes","Moradia","Serviços","Impostos e taxas","Outros"]},
    {"name":"Receitas","kind":"income","icon":"trending-up","children":["Salário","Freelance","Reembolso","Presente recebido","Venda de produtos","Rendimentos","Outras receitas"]}
  ]';
  g jsonb;
  child text;
  parent uuid;
  gi int := 0;
  ci int;
begin
  for g in select * from jsonb_array_elements(groups) loop
    insert into public.categories (user_id, kind, name, icon, sort_order)
    values (p_user, g->>'kind', g->>'name', g->>'icon', gi)
    on conflict (user_id, parent_id, name) do nothing
    returning id into parent;
    if parent is null then
      select id into parent from public.categories where user_id = p_user and parent_id is null and name = g->>'name';
    end if;
    ci := 0;
    for child in select jsonb_array_elements_text(g->'children') loop
      insert into public.categories (user_id, parent_id, kind, name, sort_order)
      values (p_user, parent, g->>'kind', child, ci)
      on conflict (user_id, parent_id, name) do nothing;
      ci := ci + 1;
    end loop;
    gi := gi + 1;
  end loop;
end $$;
revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  perform public.seed_default_categories(new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- =============================================================== auditoria
create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(case when tg_op = 'DELETE' then old.user_id else new.user_id end, auth.uid());
begin
  -- exclusão da conta: as linhas somem em cascata junto com o usuário; não há o que auditar
  if not exists (select 1 from auth.users where id = uid) then return null; end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_data, new_data)
  values (
    uid, tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['accounts', 'cards', 'account_entries', 'transfers', 'purchases', 'card_charges', 'subscriptions', 'budgets', 'goals']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.tg_audit()', t || '_audit', t);
  end loop;
end $$;

