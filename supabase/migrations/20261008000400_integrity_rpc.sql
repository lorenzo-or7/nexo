-- NEXO · integridade adiada e operações atômicas (RPC)

-- =============================================================== transferências
create or replace function public.check_transfer(tid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t public.transfers%rowtype;
  n int; total bigint; ok_out int; ok_in int; statuses int; dates int;
begin
  select * into t from public.transfers where id = tid;
  if not found then return; end if; -- apagada por cascata
  select count(*), coalesce(sum(amount_cents), 0),
         count(*) filter (where account_id = t.from_account_id and amount_cents = -t.amount_cents),
         count(*) filter (where account_id = t.to_account_id and amount_cents = t.amount_cents),
         count(distinct status), count(distinct occurred_on)
    into n, total, ok_out, ok_in, statuses, dates
    from public.account_entries where transfer_id = tid and deleted_at is null;
  if n = 0 then return; end if; -- transferência excluída de forma controlada (os dois lados)
  if n <> 2 or total <> 0 or ok_out <> 1 or ok_in <> 1 or statuses <> 1 or dates <> 1 then
    raise exception 'Transferência inconsistente: os dois lados devem ser registrados juntos'
      using errcode = '23514';
  end if;
end $$;
revoke all on function public.check_transfer(uuid) from public, anon, authenticated;

create or replace function public.tg_entries_transfer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' and old.transfer_id is not null then perform public.check_transfer(old.transfer_id); end if;
  if tg_op <> 'DELETE' and new.transfer_id is not null then perform public.check_transfer(new.transfer_id); end if;
  return null;
end $$;

create or replace function public.tg_transfers_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- toda transferência precisa ter seus dois lados ao final da transação
  if not exists (select 1 from public.account_entries where transfer_id = new.id) then
    raise exception 'Transferência sem lançamentos' using errcode = '23514';
  end if;
  perform public.check_transfer(new.id);
  return null;
end $$;

create constraint trigger entries_transfer_balanced
  after insert or update or delete on public.account_entries
  deferrable initially deferred for each row execute function public.tg_entries_transfer();

create constraint trigger transfers_balanced
  after insert or update on public.transfers
  deferrable initially deferred for each row execute function public.tg_transfers_row();

create or replace function public.require_user() returns uuid
language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Não autenticado' using errcode = '28000'; end if;
  return uid;
end $$;

create or replace function public.create_transfer(
  p_from uuid, p_to uuid, p_amount_cents bigint, p_date date,
  p_status text default 'confirmed', p_description text default null, p_idempotency_key text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  tid uuid;
begin
  if p_idempotency_key is not null then
    select id into tid from public.transfers where user_id = uid and idempotency_key = p_idempotency_key;
    if found then return tid; end if;
  end if;
  insert into public.transfers (user_id, from_account_id, to_account_id, amount_cents, occurred_on, description, idempotency_key)
  values (uid, p_from, p_to, p_amount_cents, p_date, p_description, p_idempotency_key)
  returning id into tid;
  insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description, transfer_id)
  values (uid, p_from, 'transfer', p_status, -p_amount_cents, p_date, p_description, tid),
         (uid, p_to, 'transfer', p_status, p_amount_cents, p_date, p_description, tid);
  return tid;
exception when unique_violation then
  select id into tid from public.transfers where user_id = uid and idempotency_key = p_idempotency_key;
  if tid is null then raise; end if;
  return tid;
end $$;

create or replace function public.update_transfer(
  p_id uuid, p_amount_cents bigint, p_date date, p_status text, p_description text, p_expected_version int default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  t public.transfers%rowtype;
  v int;
begin
  perform public.require_user();
  select * into t from public.transfers where id = p_id for update;
  if not found then raise exception 'Transferência não encontrada' using errcode = 'P0002'; end if;
  if p_expected_version is not null then
    select max(version) into v from public.account_entries where transfer_id = p_id;
    if v <> p_expected_version then
      raise exception 'Registro alterado em outra sessão; recarregue' using errcode = '40001';
    end if;
  end if;
  update public.transfers set amount_cents = p_amount_cents, occurred_on = p_date, description = p_description where id = p_id;
  update public.account_entries
     set amount_cents = case when account_id = t.from_account_id then -p_amount_cents else p_amount_cents end,
         occurred_on = p_date, status = p_status, description = p_description
   where transfer_id = p_id;
end $$;

-- =============================================================== compras no crédito
-- As parcelas são calculadas pelo motor de domínio no servidor e conferidas aqui:
-- quantidade, numeração, meses consecutivos e soma EXATA igual ao total.
create or replace function public.create_credit_purchase(
  p_card uuid, p_description text, p_category uuid, p_date date, p_total_cents bigint,
  p_installments jsonb, p_first_invoice_manual boolean default false, p_notes text default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  pid uuid;
  n int := jsonb_array_length(p_installments);
  s bigint;
  i int;
  first_ref text := p_installments->0->>'invoice_ref';
begin
  if p_idempotency_key is not null then
    select id into pid from public.purchases where user_id = uid and idempotency_key = p_idempotency_key;
    if found then return pid; end if;
  end if;
  select sum((x->>'amount_cents')::bigint) into s from jsonb_array_elements(p_installments) x;
  if n < 1 or s is distinct from p_total_cents then
    raise exception 'Parcelas não somam o total da compra' using errcode = '23514';
  end if;
  for i in 0 .. n - 1 loop
    if (p_installments->i->>'number')::int <> i + 1
       or (p_installments->i->>'invoice_ref') <> to_char((first_ref || '-01')::date + make_interval(months => i), 'YYYY-MM')
       or (p_installments->i->>'amount_cents')::bigint <= 0 then
      raise exception 'Parcela % inválida', i + 1 using errcode = '23514';
    end if;
  end loop;

  insert into public.purchases (user_id, card_id, description, category_id, purchased_on, total_cents,
                                installment_count, first_invoice_ref, first_invoice_manual, notes, idempotency_key)
  values (uid, p_card, p_description, p_category, p_date, p_total_cents, n, first_ref, p_first_invoice_manual, p_notes, p_idempotency_key)
  returning id into pid;

  insert into public.card_charges (user_id, card_id, purchase_id, kind, installment_number, installment_count,
                                   invoice_ref, amount_cents, occurred_on, description)
  select uid, p_card, pid, 'installment', (x->>'number')::int, n, x->>'invoice_ref', (x->>'amount_cents')::bigint, p_date, p_description
    from jsonb_array_elements(p_installments) x;
  return pid;
exception when unique_violation then
  select id into pid from public.purchases where user_id = uid and idempotency_key = p_idempotency_key;
  if pid is null then raise; end if;
  return pid;
end $$;

create or replace function public.refund_purchase(
  p_purchase uuid, p_credit_cents bigint, p_date date, p_invoice_ref text, p_cancel_ids uuid[] default '{}'
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  p public.purchases%rowtype;
  remaining bigint;
begin
  select * into p from public.purchases where id = p_purchase for update;
  if not found then raise exception 'Compra não encontrada' using errcode = 'P0002'; end if;
  select coalesce(sum(amount_cents), 0) into remaining from public.card_charges
   where purchase_id = p_purchase and cancelled_at is null;
  if p_credit_cents < 0 or p_credit_cents > remaining then
    raise exception 'Valor de estorno maior que o saldo da compra' using errcode = '23514';
  end if;
  update public.card_charges set cancelled_at = now()
   where purchase_id = p_purchase and id = any (p_cancel_ids) and kind = 'installment' and cancelled_at is null;
  if p_credit_cents > 0 then
    insert into public.card_charges (user_id, card_id, purchase_id, kind, invoice_ref, amount_cents, occurred_on, description)
    values (uid, p.card_id, p_purchase, 'refund', p_invoice_ref, -p_credit_cents, p_date, 'Estorno: ' || p.description);
  end if;
  select coalesce(sum(amount_cents), 0) into remaining from public.card_charges
   where purchase_id = p_purchase and cancelled_at is null;
  update public.purchases set status = case when remaining = 0 then 'refunded' else 'partially_refunded' end
   where id = p_purchase;
end $$;

-- =============================================================== pagamento de fatura
-- Reduz a conta e o devido do cartão. NÃO é despesa de consumo (a compra já foi).
create or replace function public.pay_invoice(
  p_card uuid, p_invoice_ref text, p_account uuid, p_amount_cents bigint, p_date date,
  p_status text default 'confirmed', p_idempotency_key text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  eid uuid;
  card_name text;
begin
  if p_amount_cents <= 0 then raise exception 'Valor do pagamento deve ser positivo' using errcode = '23514'; end if;
  if p_idempotency_key is not null then
    select id into eid from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
    if found then return eid; end if;
  end if;
  select name into card_name from public.cards where id = p_card;
  if not found then raise exception 'Cartão não encontrado' using errcode = 'P0002'; end if;
  insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description,
                                      card_id, invoice_ref, idempotency_key)
  values (uid, p_account, 'invoice_payment', p_status, -p_amount_cents, p_date,
          'Pagamento fatura ' || card_name || ' ' || p_invoice_ref, p_card, p_invoice_ref, p_idempotency_key)
  returning id into eid;
  return eid;
exception when unique_violation then
  select id into eid from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
  if eid is null then raise; end if;
  return eid;
end $$;

-- =============================================================== assinaturas (idempotente)
create or replace function public.record_subscription_charge(
  p_subscription uuid, p_period_key text, p_due_on date, p_amount_cents bigint,
  p_invoice_ref text default null, p_status text default 'scheduled'
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  s public.subscriptions%rowtype;
  scid uuid;
  pid uuid;
begin
  select * into s from public.subscriptions where id = p_subscription;
  if not found then raise exception 'Assinatura não encontrada' using errcode = 'P0002'; end if;

  insert into public.subscription_charges (user_id, subscription_id, period_key, due_on, amount_cents)
  values (uid, p_subscription, p_period_key, p_due_on, p_amount_cents)
  on conflict (subscription_id, period_key) do nothing
  returning id into scid;

  if scid is null then
    select id into scid from public.subscription_charges where subscription_id = p_subscription and period_key = p_period_key;
    return jsonb_build_object('created', false, 'id', scid);
  end if;

  if s.pay_with = 'card' then
    if p_invoice_ref is null then raise exception 'Fatura não informada' using errcode = '23502'; end if;
    insert into public.purchases (user_id, card_id, description, category_id, purchased_on, total_cents, installment_count, first_invoice_ref)
    values (uid, s.card_id, s.name, s.category_id, p_due_on, p_amount_cents, 1, p_invoice_ref)
    returning id into pid;
    insert into public.card_charges (user_id, card_id, purchase_id, kind, installment_number, installment_count, invoice_ref,
                                     amount_cents, occurred_on, description, subscription_charge_id)
    values (uid, s.card_id, pid, 'installment', 1, 1, p_invoice_ref, p_amount_cents, p_due_on, s.name, scid);
  else
    insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description,
                                        category_id, subscription_charge_id)
    values (uid, s.account_id, 'expense', p_status, -p_amount_cents, p_due_on, s.name, s.category_id, scid);
  end if;
  return jsonb_build_object('created', true, 'id', scid);
end $$;

-- =============================================================== dados de demonstração
-- Ficam marcados is_demo = true e podem ser removidos sem tocar nos dados reais.
create or replace function public.load_demo_data(p_account_name text, p_institution text, p_today date)
returns void
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  acc uuid;
  nu uuid;
  st uuid;
begin
  if exists (select 1 from public.accounts where user_id = uid and is_demo) then
    raise exception 'Os dados de demonstração já estão carregados' using errcode = '23505';
  end if;
  insert into public.accounts (user_id, name, institution, opening_balance_cents, opening_date, is_demo, color)
  values (uid, p_account_name, p_institution, 32112, p_today, true, '#C20F49') returning id into acc;
  insert into public.cards (user_id, name, institution, brand, closing_day, due_day, payment_account_id, is_demo, color, limit_cents)
  values (uid, 'Nubank (demo)', 'Nubank', 'mastercard', 13, 20, acc, true, '#241127', 300000) returning id into nu;
  insert into public.cards (user_id, name, institution, brand, closing_day, due_day, payment_account_id, is_demo, color, limit_cents)
  values (uid, 'Santander (demo)', 'Santander', 'visa', 3, 10, acc, true, '#C20F49', 200000) returning id into st;
  insert into public.card_charges (user_id, card_id, kind, invoice_ref, amount_cents, occurred_on, description, is_demo)
  values (uid, nu, 'adjustment', '2026-10', 81488, '2026-10-01', 'Saldo da fatura (demo)', true),
         (uid, st, 'adjustment', '2026-10', 54468, '2026-10-01', 'Saldo da fatura (demo)', true);
  insert into public.account_entries (user_id, account_id, kind, status, amount_cents, occurred_on, description, is_demo)
  values (uid, acc, 'income', 'expected', 81268, '2026-10-09', 'Recebimento previsto (demo)', true),
         (uid, acc, 'income', 'expected', 48899, '2026-10-19', 'Recebimento previsto (demo)', true);
end $$;

create or replace function public.clear_demo_data() returns void
language plpgsql security invoker set search_path = public as $$
declare uid uuid := public.require_user();
begin
  delete from public.subscriptions where user_id = uid and is_demo;
  delete from public.cards where user_id = uid and is_demo;
  delete from public.accounts where user_id = uid and is_demo;
end $$;

-- =============================================================== exportação (LGPD)
create or replace function public.export_my_data() returns jsonb
language plpgsql security invoker stable set search_path = public as $$
declare uid uuid := public.require_user();
begin
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where id = uid),
    'accounts', coalesce((select jsonb_agg(to_jsonb(x)) from public.accounts x), '[]'),
    'cards', coalesce((select jsonb_agg(to_jsonb(x)) from public.cards x), '[]'),
    'invoice_overrides', coalesce((select jsonb_agg(to_jsonb(x)) from public.invoice_overrides x), '[]'),
    'categories', coalesce((select jsonb_agg(to_jsonb(x)) from public.categories x), '[]'),
    'tags', coalesce((select jsonb_agg(to_jsonb(x)) from public.tags x), '[]'),
    'transfers', coalesce((select jsonb_agg(to_jsonb(x)) from public.transfers x), '[]'),
    'entries', coalesce((select jsonb_agg(to_jsonb(x)) from public.account_entries x), '[]'),
    'purchases', coalesce((select jsonb_agg(to_jsonb(x)) from public.purchases x), '[]'),
    'card_charges', coalesce((select jsonb_agg(to_jsonb(x)) from public.card_charges x), '[]'),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscriptions x), '[]'),
    'subscription_prices', coalesce((select jsonb_agg(to_jsonb(x)) from public.subscription_prices x), '[]'),
    'recurring_templates', coalesce((select jsonb_agg(to_jsonb(x)) from public.recurring_templates x), '[]'),
    'budgets', coalesce((select jsonb_agg(to_jsonb(x)) from public.budgets x), '[]'),
    'goals', coalesce((select jsonb_agg(to_jsonb(x)) from public.goals x), '[]'),
    'goal_contributions', coalesce((select jsonb_agg(to_jsonb(x)) from public.goal_contributions x), '[]')
  );
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_transfer(uuid,uuid,bigint,date,text,text,text)',
    'update_transfer(uuid,bigint,date,text,text,integer)',
    'create_credit_purchase(uuid,text,uuid,date,bigint,jsonb,boolean,text,text)',
    'refund_purchase(uuid,bigint,date,text,uuid[])',
    'pay_invoice(uuid,text,uuid,bigint,date,text,text)',
    'record_subscription_charge(uuid,text,date,bigint,text,text)',
    'load_demo_data(text,text,date)',
    'clear_demo_data()',
    'export_my_data()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
