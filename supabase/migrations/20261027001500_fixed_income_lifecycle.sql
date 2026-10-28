-- NEXO · renda fixa: ativa × encerrada × excluída
--
-- Problema corrigido: "Excluir" só apagava de verdade quando NÃO existia nenhum lançamento ligado à renda,
-- mas o sistema cria sozinho os recebimentos PREVISTOS de cada mês vencido. Resultado: quase toda renda
-- "excluída" virava "encerrada" e continuava na lista, esmaecida.
--
-- Agora são três estados distintos:
--   ativa     → gera previsões, conta nos totais.
--   encerrada → não gera novos meses; recebimentos confirmados ficam no histórico; sai dos totais.
--   excluída  → some da lista e das projeções para sempre. Só sobram os recebimentos JÁ CONFIRMADOS
--               (dinheiro que realmente entrou no extrato); previstos e agendados são apagados.
-- Nada aqui apaga dinheiro confirmado nem mexe em outras tabelas.

alter table public.fixed_incomes add column if not exists deleted_at timestamptz;
create index if not exists fixed_incomes_alive_idx on public.fixed_incomes (user_id, status) where deleted_at is null;

-- Encerrar: para de gerar meses novos. O que já foi recebido continua no histórico.
create or replace function public.end_fixed_income(p_id uuid, p_today date) returns text
language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_user();
  perform 1 from public.fixed_incomes where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Renda não encontrada' using errcode = 'P0002'; end if;
  update public.fixed_incomes
     set status = 'ended',
         end_date = greatest(start_date, least(coalesce(end_date, p_today), p_today))
   where id = p_id;
  -- previsões de meses que ainda não chegaram deixam de existir; as já vencidas e não confirmadas continuam pendentes
  delete from public.account_entries
   where fixed_income_id = p_id and status <> 'confirmed' and occurred_on > p_today;
  return 'ended';
end $$;

-- Excluir: some de vez da lista e das projeções.
--   'deleted'              → nada de dinheiro confirmado estava ligado a ela: a renda foi apagada por inteiro.
--   'deleted_with_history' → havia recebimentos confirmados: eles ficam no Extrato; a renda fica oculta (deleted_at).
create or replace function public.remove_fixed_income(p_id uuid, p_today date) returns text
language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_user();
  perform 1 from public.fixed_incomes where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Renda não encontrada' using errcode = 'P0002'; end if;

  -- tudo que nunca virou dinheiro (previsto/agendado) e o que já estava na lixeira desta renda
  delete from public.account_entries
   where fixed_income_id = p_id and (status <> 'confirmed' or deleted_at is not null);

  if exists (select 1 from public.account_entries where fixed_income_id = p_id) then
    update public.fixed_incomes
       set deleted_at = now(), status = 'ended',
           end_date = greatest(start_date, least(coalesce(end_date, p_today), p_today))
     where id = p_id;
    return 'deleted_with_history';
  end if;
  delete from public.fixed_incomes where id = p_id;
  return 'deleted';
end $$;

-- salvar/editar não mexe em renda excluída
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

  perform 1 from public.fixed_incomes where id = fid and deleted_at is null for update;
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

-- o lançamento mensal só é criado para rendas vivas e ativas (nunca para encerradas, pausadas ou excluídas)
create or replace function public.record_fixed_income_entry(p_id uuid, p_period text, p_date date) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  f public.fixed_incomes%rowtype;
  eid uuid;
begin
  select * into f from public.fixed_incomes where id = p_id and deleted_at is null;
  if not found then raise exception 'Renda não encontrada' using errcode = 'P0002'; end if;
  if f.status <> 'active' then
    return jsonb_build_object('created', false, 'id', null);
  end if;
  insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description, category_id,
                                      fixed_income_id, fixed_income_period)
  values (uid, f.account_id, 'income', 'expected', f.amount_cents, p_date, f.name, f.category_id, p_id, p_period)
  on conflict (fixed_income_id, fixed_income_period) where fixed_income_id is not null do nothing
  returning id into eid;
  return jsonb_build_object('created', eid is not null, 'id', eid);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'end_fixed_income(uuid,date)',
    'remove_fixed_income(uuid,date)',
    'save_fixed_income(uuid,text,text,text,bigint,smallint,date,date,uuid,uuid,text)',
    'record_fixed_income_entry(uuid,text,date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
