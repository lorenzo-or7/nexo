-- NEXO · gestão de assinaturas
-- Cobranças com data até hoje viram lançamentos (ou compras no cartão) automaticamente;
-- charged_through marca até que dia isso já foi feito (pausas avançam sem cobrar).
alter table public.subscriptions add column if not exists charged_through date;

-- Cria/edita a assinatura e o preço numa só transação (nunca fica assinatura sem preço).

create or replace function public.save_subscription(
  p_id uuid,
  p_name text,
  p_category uuid,
  p_frequency text,
  p_interval smallint,
  p_start date,
  p_pay_with text,
  p_card uuid,
  p_account uuid,
  p_amount_cents bigint,
  p_price_from date,
  p_color text default null,
  p_alert_days smallint default 3
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  sid uuid := p_id;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor inválido' using errcode = '23514';
  end if;
  if sid is null then
    insert into public.subscriptions (user_id, name, category_id, frequency, interval_count, start_date, pay_with,
                                      card_id, account_id, color, renewal_alert_days)
    values (uid, p_name, p_category, p_frequency, p_interval, p_start, p_pay_with,
            case when p_pay_with = 'card' then p_card end, case when p_pay_with = 'account' then p_account end,
            p_color, p_alert_days)
    returning id into sid;
    insert into public.subscription_prices (user_id, subscription_id, effective_from, amount_cents)
    values (uid, sid, p_start, p_amount_cents);
    return sid;
  end if;

  perform 1 from public.subscriptions where id = sid for update;
  if not found then raise exception 'Assinatura não encontrada' using errcode = 'P0002'; end if;
  update public.subscriptions
     set name = p_name, category_id = p_category, frequency = p_frequency, interval_count = p_interval,
         start_date = p_start, pay_with = p_pay_with,
         card_id = case when p_pay_with = 'card' then p_card end,
         account_id = case when p_pay_with = 'account' then p_account end,
         color = p_color, renewal_alert_days = p_alert_days
   where id = sid;
  -- novo preço vale a partir da data informada; preços anteriores ficam no histórico
  insert into public.subscription_prices (user_id, subscription_id, effective_from, amount_cents)
  values (uid, sid, greatest(p_start, coalesce(p_price_from, p_start)), p_amount_cents)
  on conflict (subscription_id, effective_from) do update set amount_cents = excluded.amount_cents
  where public.subscription_prices.amount_cents is distinct from excluded.amount_cents;
  -- remove preços que ficaram antes do novo início (exceto o vigente no início)
  delete from public.subscription_prices sp
   where sp.subscription_id = sid and sp.effective_from < p_start
     and exists (select 1 from public.subscription_prices x where x.subscription_id = sid and x.effective_from <= p_start and x.effective_from > sp.effective_from);
  return sid;
end $$;
revoke all on function public.save_subscription(uuid, text, uuid, text, smallint, date, text, uuid, uuid, bigint, date, text, smallint) from public, anon;
grant execute on function public.save_subscription(uuid, text, uuid, text, smallint, date, text, uuid, uuid, bigint, date, text, smallint) to authenticated;

-- Sem cobranças lançadas: apaga. Com cobranças: cancela (o histórico fica).
create or replace function public.remove_subscription(p_subscription uuid, p_today date) returns text
language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_user();
  perform 1 from public.subscriptions where id = p_subscription for update;
  if not found then raise exception 'Assinatura não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from public.subscription_charges where subscription_id = p_subscription) then
    update public.subscriptions set status = 'cancelled', cancelled_at = coalesce(cancelled_at, p_today)
     where id = p_subscription;
    return 'cancelled';
  end if;
  delete from public.subscriptions where id = p_subscription;
  return 'deleted';
end $$;
revoke all on function public.remove_subscription(uuid, date) from public, anon;
grant execute on function public.remove_subscription(uuid, date) to authenticated;
