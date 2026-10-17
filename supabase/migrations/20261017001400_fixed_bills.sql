-- NEXO · contas fixas mensais (academia, luz, condomínio, internet...)
-- Reaproveitam a mesma estrutura das assinaturas: nome, valor, frequência, dia, categoria e forma de pagamento.
-- A coluna `kind` só separa as duas telas: 'subscription' (padrão) ou 'bill' (conta fixa).
-- Nada muda para quem já tem assinaturas: todas continuam como 'subscription'.

alter table public.subscriptions add column if not exists kind text not null default 'subscription';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_kind_check') then
    alter table public.subscriptions
      add constraint subscriptions_kind_check check (kind in ('subscription', 'bill'));
  end if;
end $$;
