-- NEXO · OPCIONAL (recomendado antes de publicar): o banco passa a recusar pagamento de fatura acima do que falta.
-- Achado da homologação (F6): hoje só a tela/servidor da aplicação confere "valor ≤ restante". Duas abas (ou um duplo
-- envio com chaves diferentes) conseguem registrar mais do que a fatura. O dano fica restrito à própria conta do usuário,
-- mas a regra deve valer no banco. Este script SUBSTITUI a função pay_invoice (mesma assinatura, mesmas permissões).
--
-- Regra: restante = soma das parcelas/encargos ativos da fatura − pagamentos ativos (não estornados, confirmados ou agendados).
-- Concorrência: trava por cartão+fatura (advisory lock transacional), então pagamentos simultâneos são serializados.
create or replace function public.pay_invoice(
  p_card uuid, p_invoice_ref text, p_account uuid, p_amount_cents bigint, p_date date,
  p_status text default 'confirmed', p_idempotency_key text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := public.require_user();
  eid uuid;
  card_name text;
  due bigint;
  paid bigint;
begin
  if p_amount_cents <= 0 then raise exception 'Valor do pagamento deve ser positivo' using errcode = '23514'; end if;
  if p_idempotency_key is not null then
    select id into eid from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
    if found then return eid; end if;
  end if;
  select name into card_name from public.cards where id = p_card;
  if not found then raise exception 'Cartão não encontrado' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended('nexo.invpay:' || p_card::text || ':' || p_invoice_ref, 0));
  -- repete a checagem de idempotência já com a trava (outra requisição pode ter inserido enquanto esperávamos)
  if p_idempotency_key is not null then
    select id into eid from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
    if found then return eid; end if;
  end if;
  select coalesce(sum(amount_cents), 0) into due from public.card_charges
   where card_id = p_card and invoice_ref = p_invoice_ref and cancelled_at is null;
  select coalesce(sum(-amount_cents), 0) into paid from public.account_entries
   where card_id = p_card and invoice_ref = p_invoice_ref and kind = 'invoice_payment' and deleted_at is null;
  if p_amount_cents > due - paid then
    raise exception 'O valor passa do que falta pagar nesta fatura' using errcode = '23514';
  end if;

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
revoke all on function public.pay_invoice(uuid, text, uuid, bigint, date, text, text) from public, anon;
grant execute on function public.pay_invoice(uuid, text, uuid, bigint, date, text, text) to authenticated;
notify pgrst, 'reload schema';
