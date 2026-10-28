-- NEXO · Estorno de pagamento de fatura
-- O pagamento nunca é apagado de verdade: fica marcado (deleted_at) e o trigger de auditoria registra a mudança.
-- Estornar duas vezes o mesmo pagamento é impossível (a segunda chamada não encontra o lançamento ativo).
create or replace function public.reverse_invoice_payment(p_entry uuid) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  e public.account_entries%rowtype;
begin
  perform public.require_user();
  select * into e from public.account_entries
   where id = p_entry and kind = 'invoice_payment' and deleted_at is null for update;
  if not found then raise exception 'Pagamento não encontrado ou já estornado' using errcode = 'P0002'; end if;
  update public.account_entries set deleted_at = now() where id = p_entry;
  return jsonb_build_object('card_id', e.card_id, 'invoice_ref', e.invoice_ref, 'amount_cents', -e.amount_cents);
end $$;

revoke all on function public.reverse_invoice_payment(uuid) from public, anon;
grant execute on function public.reverse_invoice_payment(uuid) to authenticated;
notify pgrst, 'reload schema';
