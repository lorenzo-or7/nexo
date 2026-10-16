-- NEXO · renda fixa (salário e mensalidades de clientes)
-- Cada fonte de renda recorrente gera, no dia combinado de cada mês, um lançamento PREVISTO
-- (status 'expected') na conta escolhida. Você confirma com "Realizado" no Extrato quando o
-- dinheiro entra. Meses futuros aparecem só na projeção do saldo, sem criar lançamentos.

create table public.fixed_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'client' check (kind in ('salary', 'client')),
  name text not null check (char_length(name) between 1 and 80),
  client_name text check (char_length(client_name) <= 80),
  amount_cents public.cents not null check (amount_cents > 0),
  day_of_month smallint not null check (day_of_month between 1 and 31),
  -- data do primeiro recebimento (o dia dela é o dia do mês)
  start_date date not null,
  end_date date,
  account_id uuid not null,
  category_id uuid,
  notes text check (char_length(notes) <= 500),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  check (end_date is null or end_date >= start_date),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create index fixed_incomes_user_idx on public.fixed_incomes (user_id, status);
create trigger fixed_incomes_touch before update on public.fixed_incomes for each row execute function public.tg_touch();
create trigger fixed_incomes_audit after insert or update or delete on public.fixed_incomes for each row execute function public.tg_audit();

alter table public.fixed_incomes enable row level security;
create policy fixed_incomes_owner on public.fixed_incomes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.fixed_incomes to authenticated;
revoke all on public.fixed_incomes from anon;

-- liga o lançamento ao mês de origem; o índice único garante que nunca duplica
alter table public.account_entries
  add column fixed_income_id uuid,
  add column fixed_income_period text check (fixed_income_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  add foreign key (fixed_income_id, user_id) references public.fixed_incomes (id, user_id) on delete restrict,
  add check ((fixed_income_id is null) = (fixed_income_period is null));
create unique index entries_fixed_income_period_uq on public.account_entries (fixed_income_id, fixed_income_period)
  where fixed_income_id is not null;

-- Dia do mês ajustado ao tamanho do mês (dia 31 em fevereiro vira 28/29).
create or replace function public.fixed_income_date(p_period text, p_day int) returns date
language sql immutable set search_path = public as $$
  select (to_date(p_period || '-01', 'YYYY-MM-DD')
          + (least(p_day, extract(day from (to_date(p_period || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'))::int) - 1))::date
$$;

-- Cria/edita a fonte. Ao editar, os lançamentos ainda previstos (não realizados) acompanham as mudanças.
create or replace function public.save_fixed_income(
  p_id uuid, p_kind text, p_name text, p_client text, p_amount_cents bigint, p_day smallint,
  p_start date, p_end date, p_account uuid, p_category uuid, p_notes text
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  fid uuid := p_id;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido' using errcode = '23514';
  end if;
  if fid is null then
    insert into public.fixed_incomes (user_id, kind, name, client_name, amount_cents, day_of_month, start_date, end_date,
                                      account_id, category_id, notes)
    values (uid, p_kind, p_name, nullif(btrim(p_client), ''), p_amount_cents, p_day, p_start, p_end, p_account, p_category, nullif(btrim(p_notes), ''))
    returning id into fid;
    return fid;
  end if;

  perform 1 from public.fixed_incomes where id = fid for update;
  if not found then raise exception 'Renda não encontrada' using errcode = 'P0002'; end if;
  update public.fixed_incomes
     set kind = p_kind, name = p_name, client_name = nullif(btrim(p_client), ''), amount_cents = p_amount_cents,
         day_of_month = p_day, start_date = p_start, end_date = p_end, account_id = p_account,
         category_id = p_category, notes = nullif(btrim(p_notes), '')
   where id = fid;
  update public.account_entries
     set amount_cents = p_amount_cents, account_id = p_account, description = p_name, category_id = p_category,
         occurred_on = public.fixed_income_date(fixed_income_period, p_day)
   where fixed_income_id = fid and status = 'expected' and deleted_at is null;
  return fid;
end $$;

-- Lança o recebimento previsto de um mês (idempotente: UNIQUE por fonte + mês).
create or replace function public.record_fixed_income_entry(p_id uuid, p_period text, p_date date) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  f public.fixed_incomes%rowtype;
  eid uuid;
begin
  select * into f from public.fixed_incomes where id = p_id;
  if not found then raise exception 'Renda não encontrada' using errcode = 'P0002'; end if;
  insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description, category_id,
                                      fixed_income_id, fixed_income_period)
  values (uid, f.account_id, 'income', 'expected', f.amount_cents, p_date, f.name, f.category_id, p_id, p_period)
  on conflict (fixed_income_id, fixed_income_period) where fixed_income_id is not null do nothing
  returning id into eid;
  return jsonb_build_object('created', eid is not null, 'id', eid);
end $$;

-- Sem recebimentos lançados: apaga. Com histórico: encerra (o histórico fica).
create or replace function public.remove_fixed_income(p_id uuid, p_today date) returns text
language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_user();
  perform 1 from public.fixed_incomes where id = p_id for update;
  if not found then raise exception 'Renda não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from public.account_entries where fixed_income_id = p_id) then
    update public.fixed_incomes set status = 'ended', end_date = greatest(start_date, least(coalesce(end_date, p_today), p_today))
     where id = p_id;
    -- recebimentos futuros ainda previstos deixam de existir
    update public.account_entries set deleted_at = now()
     where fixed_income_id = p_id and status = 'expected' and deleted_at is null and occurred_on > p_today;
    return 'ended';
  end if;
  delete from public.fixed_incomes where id = p_id;
  return 'deleted';
end $$;

-- contas com renda fixa cadastrada também só podem ser arquivadas, não apagadas
create or replace function public.remove_account(p_account uuid) returns text
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
begin
  perform 1 from public.accounts where id = p_account and user_id = uid for update;
  if not found then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from public.account_entries where account_id = p_account)
     or exists (select 1 from public.subscriptions where account_id = p_account)
     or exists (select 1 from public.recurring_templates where account_id = p_account)
     or exists (select 1 from public.fixed_incomes where account_id = p_account) then
    update public.accounts set archived_at = now() where id = p_account;
    update public.cards set payment_account_id = null where payment_account_id = p_account;
    return 'archived';
  end if;
  delete from public.accounts where id = p_account;
  return 'deleted';
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'save_fixed_income(uuid,text,text,text,bigint,smallint,date,date,uuid,uuid,text)',
    'record_fixed_income_entry(uuid,text,date)',
    'remove_fixed_income(uuid,date)',
    'remove_account(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- recarrega o cache de esquema do PostgREST (a API passa a enxergar a tabela nova)
notify pgrst, 'reload schema';
