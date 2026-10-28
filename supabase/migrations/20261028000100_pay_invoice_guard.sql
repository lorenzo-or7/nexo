-- NEXO · Pagamento de fatura com guarda no banco (achado F6 da homologação de 28/10/2026)
-- Antes: só a tela/servidor conferia "valor ≤ restante". Duas abas, ou um duplo envio com chaves diferentes, podiam pagar
-- mais do que a fatura. Agora o BANCO garante, sob trava, que a soma dos pagamentos nunca passa do devido.
--
-- Regras (todas dentro de uma transação, security invoker → RLS continua valendo):
--  1. Valor positivo; situação só 'confirmed' ou 'scheduled'; fatura no formato AAAA-MM; chave de idempotência com até 100 caracteres.
--  2. O cartão e a conta de pagamento precisam ser do usuário logado (checagem explícita, além da RLS) e a conta não pode estar arquivada.
--  3. Trava por cartão + fatura (advisory lock transacional): pagamentos simultâneos da mesma fatura são serializados.
--  4. restante = soma das parcelas/encargos ativos da fatura − pagamentos ativos (não estornados; confirmados ou agendados).
--     Valor maior que o restante é recusado; fatura sem restante é "já quitada".
--  5. Idempotência consistente: a mesma chave com os mesmos dados devolve o mesmo pagamento; a mesma chave com dados diferentes,
--     usada por outra operação ou por um pagamento já estornado é RECUSADA (nunca devolve um id que não corresponde ao pedido).
-- Mesma assinatura e mesmas permissões da função anterior (create or replace).
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
  prev public.account_entries%rowtype;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Valor do pagamento deve ser positivo' using errcode = '23514';
  end if;
  if p_status is null or p_status not in ('confirmed', 'scheduled') then
    raise exception 'Situação do pagamento inválida' using errcode = '23514';
  end if;
  if p_invoice_ref is null or p_invoice_ref !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Fatura inválida' using errcode = '23514';
  end if;
  if p_date is null then
    raise exception 'Data do pagamento obrigatória' using errcode = '23502';
  end if;
  if p_idempotency_key is not null and char_length(p_idempotency_key) > 100 then
    raise exception 'Chave de idempotência inválida' using errcode = '23514';
  end if;

  -- propriedade explícita do cartão e da conta (a RLS já filtra; aqui a mensagem é clara e não depende só dela)
  select name into card_name from public.cards where id = p_card and user_id = uid;
  if not found then raise exception 'Cartão não encontrado' using errcode = 'P0002'; end if;
  perform 1 from public.accounts where id = p_account and user_id = uid and archived_at is null;
  if not found then raise exception 'Conta não encontrada' using errcode = 'P0002'; end if;

  -- serializa os pagamentos desta fatura: leitura do restante e inserção acontecem sob a mesma trava
  perform pg_advisory_xact_lock(hashtextextended('nexo.invpay:' || p_card::text || ':' || p_invoice_ref, 0));

  if p_idempotency_key is not null then
    select * into prev from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
    if found then
      if prev.kind <> 'invoice_payment' or prev.card_id is distinct from p_card or prev.invoice_ref is distinct from p_invoice_ref
         or prev.account_id is distinct from p_account or prev.amount_cents <> -p_amount_cents then
        raise exception 'Chave de idempotência já usada em outra operação' using errcode = '22023';
      end if;
      if prev.deleted_at is not null then
        raise exception 'Este pagamento já foi estornado; faça um novo pagamento' using errcode = '22023';
      end if;
      return prev.id;
    end if;
  end if;

  select coalesce(sum(amount_cents), 0) into due from public.card_charges
   where user_id = uid and card_id = p_card and invoice_ref = p_invoice_ref and cancelled_at is null;
  select coalesce(sum(-amount_cents), 0) into paid from public.account_entries
   where user_id = uid and card_id = p_card and invoice_ref = p_invoice_ref and kind = 'invoice_payment' and deleted_at is null;
  if due - paid <= 0 then
    raise exception 'Esta fatura já está quitada' using errcode = '23514';
  end if;
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
  -- corrida na mesma chave (faturas diferentes não compartilham a trava): devolve o existente só se for o mesmo pedido.
  -- Atenção: os erros de idempotência acima usam SQLSTATE 22023 de propósito; 23505 cairia neste handler.
  select * into prev from public.account_entries where user_id = uid and idempotency_key = p_idempotency_key;
  if not found then raise; end if;
  if prev.kind <> 'invoice_payment' or prev.card_id is distinct from p_card or prev.invoice_ref is distinct from p_invoice_ref
     or prev.account_id is distinct from p_account or prev.amount_cents <> -p_amount_cents then
    raise exception 'Chave de idempotência já usada em outra operação' using errcode = '22023';
  end if;
  if prev.deleted_at is not null then
    raise exception 'Este pagamento já foi estornado; faça um novo pagamento' using errcode = '22023';
  end if;
  return prev.id;
end $$;

revoke all on function public.pay_invoice(uuid, text, uuid, bigint, date, text, text) from public, anon;
grant execute on function public.pay_invoice(uuid, text, uuid, bigint, date, text, text) to authenticated;
notify pgrst, 'reload schema';
