-- NEXO · categorias personalizadas
-- Regras: no máximo dois níveis (categoria → subcategoria) e a subcategoria
-- tem o mesmo tipo (despesa/receita) da categoria principal.

create or replace function public.tg_category_rules() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  p public.categories%rowtype;
begin
  if new.parent_id is not null then
    select * into p from public.categories where id = new.parent_id;
    if p.parent_id is not null then
      raise exception 'Subcategoria não pode ter subcategorias' using errcode = '23514';
    end if;
    if p.kind <> new.kind then
      raise exception 'A subcategoria precisa ser do mesmo tipo da categoria principal' using errcode = '23514';
    end if;
    if exists (select 1 from public.categories where parent_id = new.id) then
      raise exception 'Esta categoria tem subcategorias e não pode virar subcategoria' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger categories_rules before insert or update on public.categories
  for each row execute function public.tg_category_rules();

-- mudar o tipo de uma categoria principal leva junto as subcategorias
create or replace function public.tg_category_kind_cascade() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  update public.categories set kind = new.kind where parent_id = new.id and kind <> new.kind;
  return null;
end $$;

create trigger categories_kind_cascade after update of kind on public.categories
  for each row when (new.parent_id is null and new.kind is distinct from old.kind)
  execute function public.tg_category_kind_cascade();

-- Exclui a categoria sem uso; com lançamentos, arquiva (o histórico continua com o nome certo).
-- Subcategorias seguem a principal.
create or replace function public.remove_category(p_category uuid) returns text
language plpgsql security invoker set search_path = public as $$
declare
  ids uuid[];
  used boolean;
begin
  perform public.require_user();
  perform 1 from public.categories where id = p_category for update;
  if not found then raise exception 'Categoria não encontrada' using errcode = 'P0002'; end if;
  select array_agg(id) into ids from public.categories where id = p_category or parent_id = p_category;
  used := exists (select 1 from public.account_entries where category_id = any (ids))
       or exists (select 1 from public.purchases where category_id = any (ids))
       or exists (select 1 from public.subscriptions where category_id = any (ids))
       or exists (select 1 from public.recurring_templates where category_id = any (ids))
       or exists (select 1 from public.budgets where category_id = any (ids));
  if used then
    update public.categories set archived_at = now() where id = any (ids) and archived_at is null;
    return 'archived';
  end if;
  delete from public.categories where id = p_category;
  return 'deleted';
end $$;
revoke all on function public.remove_category(uuid) from public, anon;
grant execute on function public.remove_category(uuid) to authenticated;
