-- NEXO · reembolsos de terceiros
-- Uma compra (no crédito ou em conta) que outra pessoa vai pagar gera um
-- lançamento de reembolso "a receber", ligado à compra original:
--   * entra na projeção na data combinada (normalmente perto do vencimento da fatura);
--   * ao ser recebido, reduz o consumo na categoria da compra;
--   * a soma dos reembolsos nunca passa do valor da compra.

alter table public.account_entries
  add column counterparty text check (counterparty is null or char_length(counterparty) between 1 and 60),
  add column purchase_id uuid,
  add column reimburses_entry_id uuid;

alter table public.account_entries
  add foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade,
  add foreign key (reimburses_entry_id, user_id) references public.account_entries (id, user_id) on delete cascade,
  add check (purchase_id is null or reimburses_entry_id is null),
  add check ((purchase_id is null and reimburses_entry_id is null) or kind = 'refund');

create index entries_purchase_idx on public.account_entries (purchase_id) where purchase_id is not null;
create index entries_reimburses_idx on public.account_entries (reimburses_entry_id) where reimburses_entry_id is not null;
create index entries_counterparty_idx on public.account_entries (user_id, counterparty) where counterparty is not null and deleted_at is null;

create or replace function public.add_reimbursement(
  p_purchase uuid, p_entry uuid, p_account uuid, p_amount_cents bigint, p_date date,
  p_counterparty text, p_status text default 'scheduled', p_idempotency_key text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  total bigint;
  already bigint;
  cat uuid;
  label text;
  eid uuid;
begin
  if (p_purchase is null) = (p_entry is null) then
    raise exception 'Informe a compra ou a despesa' using errcode = '22023';
  end if;
  if p_amount_cents <= 0 then raise exception 'Valor deve ser positivo' using errcode = '23514'; end if;
  if p_counterparty is null or btrim(p_counterparty) = '' then
    raise exception 'Informe quem vai pagar' using errcode = '23502';
  end if;
  if p_idempotency_key is not null then
    select id into eid from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
    if found then return eid; end if;
  end if;

  if p_purchase is not null then
    select total_cents, category_id, description into total, cat, label
      from public.purchases where id = p_purchase and deleted_at is null for update;
    if not found then raise exception 'Compra não encontrada' using errcode = 'P0002'; end if;
    select coalesce(sum(amount_cents), 0) into already from public.account_entries
     where purchase_id = p_purchase and deleted_at is null;
  else
    select -amount_cents, category_id, description into total, cat, label
      from public.account_entries where id = p_entry and kind = 'expense' and deleted_at is null for update;
    if not found then raise exception 'Despesa não encontrada' using errcode = 'P0002'; end if;
    select coalesce(sum(amount_cents), 0) into already from public.account_entries
     where reimburses_entry_id = p_entry and deleted_at is null;
  end if;

  if already + p_amount_cents > total then
    raise exception 'O reembolso passa do valor da compra (faltam % centavos)', total - already using errcode = '23514';
  end if;

  insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description,
                                      category_id, counterparty, purchase_id, reimburses_entry_id, idempotency_key)
  values (uid, p_account, 'refund', p_status, p_amount_cents, p_date,
          'Reembolso: ' || coalesce(label, 'compra'), cat, btrim(p_counterparty), p_purchase, p_entry, p_idempotency_key)
  returning id into eid;
  return eid;
end $$;
revoke all on function public.add_reimbursement(uuid,uuid,uuid,bigint,date,text,text,text) from public, anon;
grant execute on function public.add_reimbursement(uuid,uuid,uuid,bigint,date,text,text,text) to authenticated;

-- excluir a compra/despesa tira junto os reembolsos ainda não recebidos
create or replace function public.delete_purchase(p_purchase uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_user();
  perform 1 from public.purchases where id = p_purchase and deleted_at is null for update;
  if not found then raise exception 'Compra não encontrada' using errcode = 'P0002'; end if;
  update public.card_charges set cancelled_at = now() where purchase_id = p_purchase and cancelled_at is null;
  update public.account_entries set deleted_at = now()
   where purchase_id = p_purchase and status <> 'confirmed' and deleted_at is null;
  update public.purchases set deleted_at = now() where id = p_purchase;
end $$;

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
    update public.account_entries set deleted_at = now()
     where reimburses_entry_id = p_entry and status <> 'confirmed' and deleted_at is null;
  end if;
end $$;
