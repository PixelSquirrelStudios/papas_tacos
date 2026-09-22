begin;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  checkout_key uuid not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  event_id uuid not null references public.events(id) on delete restrict,
  pickup_slot_id uuid not null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  customer_email text not null check (char_length(customer_email) between 3 and 254),
  customer_phone text not null check (char_length(customer_phone) between 3 and 30),
  customer_note text not null default '' check (char_length(customer_note) <= 1000),
  pickup_starts_at timestamptz not null,
  pickup_ends_at timestamptz not null,
  pickup_location jsonb not null check (jsonb_typeof(pickup_location) = 'object'),
  status text not null default 'ordered' check (status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup', 'collected', 'cancelled')),
  payment_method text not null check (payment_method in ('card', 'cash')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'partially_refunded', 'refunded', 'failed')),
  subtotal_pence integer not null check (subtotal_pence between 0 and 10000000),
  service_fee_pence integer not null default 0 check (service_fee_pence between 0 and 10000),
  packaging_fee_pence integer not null default 0 check (packaging_fee_pence between 0 and 10000),
  total_pence integer generated always as (subtotal_pence + service_fee_pence + packaging_fee_pence) stored,
  currency text not null default 'gbp' check (currency = 'gbp'),
  reservation_expires_at timestamptz,
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pickup_slot_id, event_id) references public.pickup_slots(id, event_id) on delete restrict,
  check (pickup_ends_at > pickup_starts_at),
  check (status <> 'pending_payment' or (payment_method = 'card' and payment_status = 'unpaid' and reservation_expires_at is not null)),
  check (payment_method <> 'card' or status in ('pending_payment', 'cancelled') or payment_status in ('paid', 'partially_refunded', 'refunded')),
  check (status <> 'collected' or payment_status in ('paid', 'partially_refunded', 'refunded'))
);

create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_queue_idx on public.orders (event_id, status, pickup_starts_at);
create index orders_slot_idx on public.orders (pickup_slot_id, status);
create index orders_expiring_idx on public.orders (reservation_expires_at) where status = 'pending_payment';

create function private.event_ordering_reason(settings public.business_settings, event_record public.events)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when settings.singleton is null then 'business_closed'
    when settings.ordering_status = 'closed' then 'business_closed'
    when settings.ordering_status = 'paused' then 'business_paused'
    when event_record.id is null or not event_record.is_published then 'event_unavailable'
    when not event_record.pickup_enabled then 'pickup_disabled'
    when event_record.ordering_status = 'closed' then 'event_closed'
    when event_record.ordering_status = 'paused' then 'event_paused'
    when now() < event_record.orders_open_at then 'not_open_yet'
    when now() >= coalesce(event_record.orders_close_at, event_record.ends_at) then 'ordering_ended'
    else 'open'
  end;
$$;

revoke all on function private.event_ordering_reason(public.business_settings, public.events) from public;
grant execute on function private.event_ordering_reason(public.business_settings, public.events) to anon, authenticated, service_role;

create function public.get_event_ordering_state(event_uuid uuid)
returns table (accepting_orders boolean, reason text)
language sql
stable
security invoker
set search_path = ''
as $$
  select state.reason = 'open', state.reason from (
    select private.event_ordering_reason(settings, event_record) as reason
    from public.business_settings as settings
    left join public.events as event_record on event_record.id = event_uuid
    where settings.singleton
  ) as state;
$$;

revoke all on function public.get_event_ordering_state(uuid) from public;
grant execute on function public.get_event_ordering_state(uuid) to anon, authenticated, service_role;

create function private.guard_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.business_settings%rowtype;
  event_record public.events%rowtype;
  slot_record public.pickup_slots%rowtype;
  reason text;
  occupied_slots integer;
begin
  select * into settings from public.business_settings where singleton for share;
  select * into event_record from public.events where id = new.event_id for share;
  reason := private.event_ordering_reason(settings, event_record);
  if reason <> 'open' then
    raise exception 'Ordering unavailable: %', reason;
  end if;
  select * into slot_record from public.pickup_slots
  where id = new.pickup_slot_id and event_id = new.event_id for update;
  if not found or not slot_record.is_enabled then
    raise exception 'Pickup slot unavailable';
  end if;
  if slot_record.starts_at < event_record.starts_at or slot_record.ends_at > event_record.ends_at
     or slot_record.starts_at <= now() + make_interval(mins => event_record.pickup_lead_minutes) then
    raise exception 'Pickup slot outside trading hours or preparation lead time';
  end if;
  select count(*) into occupied_slots from public.orders
  where pickup_slot_id = new.pickup_slot_id
    and status <> 'cancelled'
    and (status <> 'pending_payment' or reservation_expires_at > now());
  if occupied_slots >= slot_record.capacity then
    raise exception 'Pickup slot is full';
  end if;
  if new.customer_id is null then
    raise exception 'A customer account is required to place an order';
  end if;
  if new.payment_status <> 'unpaid' then
    raise exception 'New orders must start unpaid';
  end if;
  if new.payment_method = 'cash' and (not settings.cash_enabled or new.status <> 'ordered') then
    raise exception 'Cash checkout unavailable or invalid initial status';
  end if;
  if new.payment_method = 'card' and (not settings.card_enabled or new.status <> 'pending_payment'
     or new.reservation_expires_at is null or new.reservation_expires_at <= now()
     or new.reservation_expires_at > now() + interval '30 minutes') then
    raise exception 'Card checkout unavailable or invalid payment reservation';
  end if;
  if new.subtotal_pence < settings.minimum_order_pence then
    raise exception 'Minimum food order amount not met';
  end if;
  if new.service_fee_pence <> settings.service_fee_pence or new.packaging_fee_pence <> settings.packaging_fee_pence then
    raise exception 'Order fees do not match current business settings';
  end if;
  new.pickup_starts_at := slot_record.starts_at;
  new.pickup_ends_at := slot_record.ends_at;
  new.pickup_location := jsonb_build_object(
    'event_title', event_record.title,
    'venue_name', event_record.venue_name,
    'address_line_1', event_record.address_line_1,
    'address_line_2', event_record.address_line_2,
    'town', event_record.town,
    'postcode', event_record.postcode
  );
  return new;
end;
$$;

revoke all on function private.guard_new_order() from public;

create trigger orders_guard_insert before insert on public.orders
for each row execute function private.guard_new_order();
create trigger orders_updated_at before update on public.orders
for each row execute function private.set_updated_at();

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
grant usage, select on sequence public.orders_order_number_seq to service_role;

create policy orders_read on public.orders for select to authenticated
using (customer_id = (select auth.uid()) or (select private.is_admin()));

commit;