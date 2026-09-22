begin;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null check (provider in ('stripe', 'cash')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'partially_refunded', 'refunded')),
  amount_pence integer not null check (amount_pence between 0 and 10020000),
  refunded_pence integer not null default 0 check (refunded_pence >= 0 and refunded_pence <= amount_pence),
  currency text not null default 'gbp' check (currency = 'gbp'),
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  collected_by uuid references public.profiles(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider <> 'cash' or (stripe_checkout_session_id is null and stripe_payment_intent_id is null))
);

create index payments_order_idx on public.payments (order_id);
create index payments_collected_by_idx on public.payments (collected_by);
create unique index payments_cash_order_idx on public.payments (order_id) where provider = 'cash';
create trigger payments_updated_at before update on public.payments
for each row execute function private.set_updated_at();

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;

create policy payments_admin_read on public.payments for select to authenticated
using ((select private.is_admin()));

commit;