-- NEXO · esquema principal
-- Convenções:
--   * Todo valor monetário é BIGINT em centavos (BRL). Nunca float/real/numeric com escala livre.
--   * Toda tabela de dados do usuário tem user_id e UNIQUE (id, user_id); relações entre
--     tabelas usam FK COMPOSTA (x_id, user_id), o que torna impossível, no nível do banco,
--     ligar um registro a outro de outro usuário — além do RLS.
--   * Datas financeiras são DATE (dia de calendário local do usuário).
--   * Mês de fatura/período é texto 'YYYY-MM'.
--   * Exclusão de lançamentos é controlada (deleted_at) e auditada.


-- ------------------------------------------------------------------ helpers
create or replace function public.tg_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end $$;

create domain public.cents as bigint check (value between -100000000000000 and 100000000000000);
create domain public.month_ref as text check (value ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- ------------------------------------------------------------------ perfis
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  theme text not null default 'dark' check (theme in ('light', 'dark', 'system')),
  -- "quanto posso gastar?"
  include_expected_income boolean not null default false,
  reserve_cents public.cents not null default 0 check (reserve_cents >= 0),
  safety_margin_cents public.cents not null default 0 check (safety_margin_cents >= 0),
  -- notificações: externas só com consentimento explícito
  notify_in_app boolean not null default true,
  notify_email boolean not null default false,
  notify_push boolean not null default false,
  invoice_alert_days smallint not null default 3 check (invoice_alert_days between 0 and 30),
  onboarding_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create trigger profiles_touch before update on public.profiles for each row execute function public.tg_touch();

-- ------------------------------------------------------------------ contas
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  institution text check (char_length(institution) <= 60),
  nickname text check (char_length(nickname) <= 40),
  account_type text not null default 'checking'
    check (account_type in ('checking', 'savings', 'digital', 'cash', 'investment', 'other')),
  color text not null default '#C20F49' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text check (char_length(icon) <= 40),
  opening_balance_cents public.cents not null default 0,
  opening_date date not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id)
);
create index accounts_user_idx on public.accounts (user_id) where archived_at is null;
create trigger accounts_touch before update on public.accounts for each row execute function public.tg_touch();

-- ------------------------------------------------------------------ categorias
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid,
  kind text not null check (kind in ('expense', 'income')),
  name text not null check (char_length(name) between 1 and 50),
  icon text,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  unique nulls not distinct (user_id, parent_id, name),
  foreign key (parent_id, user_id) references public.categories (id, user_id) on delete cascade,
  check (parent_id is distinct from id)
);
create index categories_user_idx on public.categories (user_id, parent_id, sort_order);
create trigger categories_touch before update on public.categories for each row execute function public.tg_touch();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  unique (id, user_id),
  unique (user_id, name)
);

-- ------------------------------------------------------------------ cartões
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  nickname text check (char_length(nickname) <= 40),
  institution text check (char_length(institution) <= 60),
  brand text not null default 'other' check (brand in ('visa', 'mastercard', 'elo', 'amex', 'hipercard', 'other')),
  -- apenas os 4 últimos dígitos, opcionais. Nunca número completo nem CVV.
  last_four char(4) check (last_four ~ '^\d{4}$'),
  limit_cents public.cents not null default 0 check (limit_cents >= 0),
  limit_rule text not null default 'full_amount' check (limit_rule in ('full_amount', 'billed_only')),
  closing_day smallint not null check (closing_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  closing_to_due_months smallint check (closing_to_due_months in (0, 1)),
  closing_day_rule text not null default 'next_invoice' check (closing_day_rule in ('next_invoice', 'current_invoice')),
  payment_account_id uuid,
  color text not null default '#241127' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  style text not null default 'gradient' check (style in ('gradient', 'solid', 'glass')),
  sort_order integer not null default 0,
  archived_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  foreign key (payment_account_id, user_id) references public.accounts (id, user_id) on delete set null (payment_account_id)
);
create index cards_user_idx on public.cards (user_id) where archived_at is null;
create trigger cards_touch before update on public.cards for each row execute function public.tg_touch();

-- exceções de datas de uma fatura específica (feriados, emissor que antecipa)
create table public.invoice_overrides (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  invoice_ref public.month_ref not null,
  closing_date date,
  due_date date,
  note text,
  primary key (card_id, invoice_ref),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  check (closing_date is not null or due_date is not null),
  check (closing_date is null or due_date is null or closing_date < due_date)
);

-- ------------------------------------------------------------------ transferências
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount_cents public.cents not null check (amount_cents > 0),
  occurred_on date not null,
  description text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, idempotency_key),
  check (from_account_id <> to_account_id),
  foreign key (from_account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (to_account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

-- ------------------------------------------------------------------ recorrências genéricas
create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  description text not null,
  amount_cents public.cents not null check (amount_cents > 0),
  account_id uuid,
  category_id uuid,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 366),
  start_date date not null,
  end_date date,
  max_count integer check (max_count > 0),
  -- receitas futuras entram como "expected" (previstas) por padrão
  default_status text not null default 'expected' check (default_status in ('scheduled', 'expected')),
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  check (end_date is null or end_date >= start_date),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create trigger recurring_touch before update on public.recurring_templates for each row execute function public.tg_touch();

-- ------------------------------------------------------------------ lançamentos em conta
-- Receitas, despesas, lados de transferência, pagamentos de fatura, reembolsos e ajustes.
-- Compras no crédito NÃO ficam aqui (ver card_charges): não afetam o saldo bancário.
create table public.account_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null,
  kind text not null check (kind in ('income', 'expense', 'transfer', 'invoice_payment', 'refund', 'adjustment')),
  -- confirmed = realizado (entra no saldo real); scheduled = agendado/confirmado; expected = previsto
  status text not null check (status in ('confirmed', 'scheduled', 'expected')),
  amount_cents public.cents not null check (amount_cents <> 0),
  occurred_on date not null,
  description text check (char_length(description) <= 140),
  category_id uuid,
  payment_method text check (payment_method in ('pix', 'debit', 'cash', 'boleto', 'ted', 'auto_debit', 'other')),
  notes text check (char_length(notes) <= 2000),
  attachment_path text,
  transfer_id uuid,
  card_id uuid,
  invoice_ref public.month_ref,
  recurring_id uuid,
  period_key text,
  subscription_charge_id uuid,
  import_fingerprint text,
  idempotency_key text,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  unique (user_id, idempotency_key),
  unique (recurring_id, period_key),
  unique (user_id, account_id, import_fingerprint),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (transfer_id, user_id) references public.transfers (id, user_id) on delete cascade,
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  foreign key (recurring_id, user_id) references public.recurring_templates (id, user_id) on delete set null (recurring_id),
  -- sinais coerentes com o tipo
  check (kind not in ('income', 'refund') or amount_cents > 0),
  check (kind not in ('expense', 'invoice_payment') or amount_cents < 0),
  check ((kind = 'transfer') = (transfer_id is not null)),
  check ((kind = 'invoice_payment') = (card_id is not null and invoice_ref is not null)),
  check ((recurring_id is null) = (period_key is null))
);
create index entries_account_date_idx on public.account_entries (account_id, occurred_on) where deleted_at is null;
create index entries_user_date_idx on public.account_entries (user_id, occurred_on desc) where deleted_at is null;
create index entries_user_status_idx on public.account_entries (user_id, status, occurred_on) where deleted_at is null and status <> 'confirmed';
create index entries_category_idx on public.account_entries (user_id, category_id, occurred_on) where deleted_at is null;
create index entries_invoice_idx on public.account_entries (card_id, invoice_ref) where card_id is not null and deleted_at is null;
create trigger entries_touch before update on public.account_entries for each row execute function public.tg_touch();

create table public.entry_tags (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entry_id uuid not null,
  tag_id uuid not null,
  primary key (entry_id, tag_id),
  foreign key (entry_id, user_id) references public.account_entries (id, user_id) on delete cascade,
  foreign key (tag_id, user_id) references public.tags (id, user_id) on delete cascade
);

-- ------------------------------------------------------------------ compras no cartão
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  description text not null check (char_length(description) between 1 and 140),
  category_id uuid,
  purchased_on date not null,
  total_cents public.cents not null check (total_cents > 0),
  installment_count smallint not null default 1 check (installment_count between 1 and 48),
  first_invoice_ref public.month_ref,
  first_invoice_manual boolean not null default false,
  notes text,
  attachment_path text,
  status text not null default 'active' check (status in ('active', 'refunded', 'partially_refunded')),
  idempotency_key text,
  is_demo boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  unique (user_id, idempotency_key),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create index purchases_card_idx on public.purchases (card_id, purchased_on desc) where deleted_at is null;
create trigger purchases_touch before update on public.purchases for each row execute function public.tg_touch();

create table public.card_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id uuid not null,
  purchase_id uuid,
  kind text not null check (kind in ('installment', 'refund', 'credit', 'adjustment', 'fee')),
  installment_number smallint,
  installment_count smallint,
  invoice_ref public.month_ref not null,
  amount_cents public.cents not null check (amount_cents <> 0),
  occurred_on date not null,
  description text,
  subscription_charge_id uuid,
  cancelled_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (purchase_id, installment_number),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade,
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade,
  check (kind not in ('installment', 'fee') or amount_cents > 0),
  check (kind not in ('refund', 'credit') or amount_cents < 0),
  check ((kind = 'installment') = (purchase_id is not null and installment_number is not null)),
  check (installment_number is null or installment_number between 1 and installment_count)
);
create index charges_invoice_idx on public.card_charges (card_id, invoice_ref) where cancelled_at is null;

-- ------------------------------------------------------------------ assinaturas
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  category_id uuid,
  frequency text not null default 'monthly' check (frequency in ('daily', 'weekly', 'monthly', 'yearly')),
  interval_count smallint not null default 1 check (interval_count between 1 and 366),
  start_date date not null,
  end_date date,
  pay_with text not null check (pay_with in ('card', 'account')),
  card_id uuid,
  account_id uuid,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  paused_from date,
  paused_until date,
  cancelled_at date,
  renewal_alert_days smallint not null default 3 check (renewal_alert_days between 0 and 60),
  color text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete restrict,
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete restrict,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  check ((pay_with = 'card') = (card_id is not null)),
  check ((pay_with = 'account') = (account_id is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create trigger subscriptions_touch before update on public.subscriptions for each row execute function public.tg_touch();

create table public.subscription_prices (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subscription_id uuid not null,
  effective_from date not null,
  amount_cents public.cents not null check (amount_cents > 0),
  primary key (subscription_id, effective_from),
  foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete cascade
);

-- uma linha por período cobrado; UNIQUE garante idempotência da geração
create table public.subscription_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subscription_id uuid not null,
  period_key text not null,
  due_on date not null,
  amount_cents public.cents not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (subscription_id, period_key),
  foreign key (subscription_id, user_id) references public.subscriptions (id, user_id) on delete cascade
);
alter table public.account_entries
  add foreign key (subscription_charge_id, user_id) references public.subscription_charges (id, user_id) on delete set null (subscription_charge_id);
alter table public.card_charges
  add foreign key (subscription_charge_id, user_id) references public.subscription_charges (id, user_id) on delete set null (subscription_charge_id);

-- ------------------------------------------------------------------ orçamentos e metas
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- vale a partir deste mês até ser substituído
  effective_month public.month_ref not null,
  amount_cents public.cents not null check (amount_cents > 0),
  alert_percent smallint not null default 80 check (alert_percent between 1 and 100),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, effective_month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'savings' check (kind in ('savings', 'emergency', 'purchase', 'travel', 'other')),
  target_cents public.cents not null check (target_cents > 0),
  target_date date,
  account_id uuid,
  status text not null default 'active' check (status in ('active', 'achieved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (id, user_id),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete set null (account_id)
);
create trigger goals_touch before update on public.goals for each row execute function public.tg_touch();

-- valores RESERVADOS para a meta — não são despesas nem saem do saldo
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount_cents public.cents not null check (amount_cents <> 0),
  occurred_on date not null,
  note text,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);

-- ------------------------------------------------------------------ notificações
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('invoice_due', 'income_expected', 'subscription_renewal', 'projected_negative', 'budget_threshold', 'overdue')),
  title text not null,
  body text,
  link text,
  due_on date,
  -- impede o mesmo alerta duas vezes
  dedupe_key text not null,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'push')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key, channel)
);
create index notifications_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

-- ------------------------------------------------------------------ importação futura (CSV/OFX)
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid,
  card_id uuid,
  format text not null check (format in ('csv', 'ofx')),
  status text not null default 'review' check (status in ('review', 'committed', 'discarded')),
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (card_id, user_id) references public.cards (id, user_id) on delete cascade
);

-- ------------------------------------------------------------------ auditoria
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  table_name text not null,
  row_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index audit_user_idx on public.audit_log (user_id, at desc);

-- ------------------------------------------------------------------ visões úteis
-- Pagamentos de fatura são lançamentos de conta do tipo invoice_payment.
create view public.invoice_payments with (security_invoker = true) as
  select id, user_id, card_id, invoice_ref, account_id, -amount_cents as amount_cents, occurred_on, status
  from public.account_entries
  where kind = 'invoice_payment' and deleted_at is null;

-- Saldo REAL por conta (apenas lançamentos realizados até hoje no fuso do usuário).
create view public.account_balances with (security_invoker = true) as
  select a.id as account_id,
         a.user_id,
         a.opening_balance_cents + coalesce(sum(e.amount_cents) filter (
           where e.status = 'confirmed'
             and e.occurred_on >= a.opening_date
             and e.occurred_on <= (now() at time zone coalesce(p.timezone, 'America/Sao_Paulo'))::date
         ), 0) as balance_cents
  from public.accounts a
  left join public.profiles p on p.id = a.user_id
  left join public.account_entries e on e.account_id = a.id and e.deleted_at is null
  group by a.id, a.user_id, a.opening_balance_cents, a.opening_date, p.timezone;
