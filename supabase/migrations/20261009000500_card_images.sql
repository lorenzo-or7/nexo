-- NEXO · aparência dos cartões e exclusão segura

-- instituição escolhida (preset de cores) e imagens enviadas pelo usuário
alter table public.cards
  add column institution_key text check (institution_key ~ '^[a-z0-9_]{1,40}$'),
  add column logo_path text check (logo_path is null or char_length(logo_path) <= 300),
  add column art_path text check (art_path is null or char_length(art_path) <= 300);

-- Exclui o cartão quando ele ainda não tem nenhum movimento; caso contrário
-- arquiva (some das telas, mas preserva o histórico financeiro e a auditoria).
create or replace function public.remove_card(p_card uuid) returns text
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  has_history boolean;
begin
  perform 1 from public.cards where id = p_card and user_id = uid for update;
  if not found then raise exception 'Cartão não encontrado' using errcode = 'P0002'; end if;
  has_history := exists (select 1 from public.card_charges where card_id = p_card)
              or exists (select 1 from public.purchases where card_id = p_card)
              or exists (select 1 from public.account_entries where card_id = p_card)
              or exists (select 1 from public.subscriptions where card_id = p_card);
  if has_history then
    update public.cards set archived_at = now() where id = p_card;
    return 'archived';
  end if;
  delete from public.cards where id = p_card;
  return 'deleted';
end $$;
revoke all on function public.remove_card(uuid) from public, anon;
grant execute on function public.remove_card(uuid) to authenticated;

-- Storage: bucket privado; cada usuário só lê e grava dentro da pasta com o próprio id.
-- (Executado apenas onde o schema storage existe, ou seja, no Supabase.)
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('card-images', 'card-images', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy card_images_select on storage.objects for select to authenticated
      using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy card_images_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy card_images_update on storage.objects for update to authenticated
      using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
    execute $p$create policy card_images_delete on storage.objects for delete to authenticated
      using (bucket_id = 'card-images' and (storage.foldername(name))[1] = (select auth.uid())::text)$p$;
  end if;
end $$;
