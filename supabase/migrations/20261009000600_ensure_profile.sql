-- NEXO · garante o perfil do usuário
-- Contas criadas antes das migrations (sem o gatilho de cadastro) ficariam sem perfil.
-- Esta função cria o perfil e as categorias iniciais do usuário logado, se faltarem.
create or replace function public.ensure_profile() returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text;
  meta jsonb;
begin
  if uid is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = uid) then return; end if;
  select email, raw_user_meta_data into mail, meta from auth.users where id = uid;
  insert into public.profiles (id, display_name)
  values (uid, coalesce(meta->>'display_name', split_part(mail, '@', 1)))
  on conflict (id) do nothing;
  perform public.seed_default_categories(uid);
end $$;
revoke all on function public.ensure_profile() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
