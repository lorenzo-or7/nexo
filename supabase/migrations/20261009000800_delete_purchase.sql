-- NEXO · excluir compra no cartão (exclusão controlada e auditada)
-- A compra é marcada como excluída e suas parcelas canceladas: some das faturas.
create or replace function public.delete_purchase(p_purchase uuid) returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform public.require_user();
  perform 1 from public.purchases where id = p_purchase and deleted_at is null for update;
  if not found then raise exception 'Compra não encontrada' using errcode = 'P0002'; end if;
  update public.card_charges set cancelled_at = now() where purchase_id = p_purchase and cancelled_at is null;
  update public.purchases set deleted_at = now() where id = p_purchase;
end $$;
revoke all on function public.delete_purchase(uuid) from public, anon;
grant execute on function public.delete_purchase(uuid) to authenticated;
