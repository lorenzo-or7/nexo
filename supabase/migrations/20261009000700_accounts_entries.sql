-- NEXO · Etapa 2: contas, lançamentos e transferências

alter table public.accounts
  add column institution_key text check (institution_key ~ '^[a-z0-9_]{1,40}$');

-- Exclui a conta sem histórico; com histórico, arquiva (preserva saldos e auditoria).
create or replace function public.remove_account(p_account uuid) returns text
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
begin
  perform 1 from public.accounts where id = p_account and user_id = uid for update;
  if not found then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from public.account_entries where account_id = p_account)
     or exists (select 1 from public.subscriptions where account_id = p_account)
     or exists (select 1 from public.recurring_templates where account_id = p_account) then
    update public.accounts set archived_at = now() where id = p_account;
    update public.cards set payment_account_id = null where payment_account_id = p_account;
    return 'archived';
  end if;
  delete from public.accounts where id = p_account;
  return 'deleted';
end $$;

-- Exclusão controlada: marca como excluído (auditado). Transferência: os dois lados juntos.
create or replace function public.delete_entry(p_entry uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  e public.account_entries%rowtype;
begin
  perform public.require_user();
  select * into e from public.account_entries where id = p_entry and deleted_at is null for update;
  if not found then raise exception 'Lançamento não encontrado' using errcode = 'P0002'; end if;
  if e.transfer_id is not null then
    update public.account_entries set deleted_at = now() where transfer_id = e.transfer_id and deleted_at is null;
  else
    update public.account_entries set deleted_at = now() where id = p_entry;
  end if;
end $$;

-- Marca um lançamento pendente como realizado (na data informada).
create or replace function public.confirm_entry(p_entry uuid, p_date date) returns void
language plpgsql security invoker set search_path = public as $$
declare
  e public.account_entries%rowtype;
begin
  perform public.require_user();
  select * into e from public.account_entries where id = p_entry and deleted_at is null for update;
  if not found then raise exception 'Lançamento não encontrado' using errcode = 'P0002'; end if;
  if e.transfer_id is not null then
    update public.account_entries set status = 'confirmed', occurred_on = p_date where transfer_id = e.transfer_id and deleted_at is null;
    update public.transfers set occurred_on = p_date where id = e.transfer_id;
  else
    update public.account_entries set status = 'confirmed', occurred_on = p_date where id = p_entry;
  end if;
end $$;

-- Edição completa de transferência (inclusive contas), com controle de versão.
create or replace function public.edit_transfer(
  p_id uuid, p_from uuid, p_to uuid, p_amount_cents bigint, p_date date,
  p_status text, p_description text, p_expected_version int default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v int;
begin
  perform public.require_user();
  perform 1 from public.transfers where id = p_id for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'P0002'; end if;
  if p_expected_version is not null then
    select max(version) into v from public.account_entries where transfer_id = p_id and deleted_at is null;
    if v <> p_expected_version then
      raise exception 'Registro alterado em outra sessão; recarregue' using errcode = '40001';
    end if;
  end if;
  update public.transfers
     set from_account_id = p_from, to_account_id = p_to, amount_cents = p_amount_cents,
         occurred_on = p_date, description = p_description
   where id = p_id;
  update public.account_entries
     set account_id = case when amount_cents < 0 then p_from else p_to end,
         amount_cents = case when amount_cents < 0 then -p_amount_cents else p_amount_cents end,
         occurred_on = p_date, status = p_status, description = p_description
   where transfer_id = p_id and deleted_at is null;
end $$;

-- Substitui as tags de um lançamento (cria as que não existem).
create or replace function public.set_entry_tags(p_entry uuid, p_names text[]) returns void
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  n text;
begin
  perform 1 from public.account_entries where id = p_entry;
  if not found then raise exception 'Lançamento não encontrado' using errcode = 'P0002'; end if;
  delete from public.entry_tags where entry_id = p_entry;
  foreach n in array coalesce(p_names, '{}') loop
    n := btrim(n);
    continue when n = '' or char_length(n) > 30;
    insert into public.tags (user_id, name) values (uid, n) on conflict (user_id, name) do nothing;
    insert into public.entry_tags (user_id, entry_id, tag_id)
    select uid, p_entry, id from public.tags where user_id = uid and name = n
    on conflict do nothing;
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'remove_account(uuid)', 'delete_entry(uuid)', 'confirm_entry(uuid,date)',
    'edit_transfer(uuid,uuid,uuid,bigint,date,text,text,integer)', 'set_entry_tags(uuid,text[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
