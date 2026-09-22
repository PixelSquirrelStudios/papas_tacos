begin;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  featured_image_path text,
  image_alt text not null default '',
  venue_name text not null,
  address_line_1 text not null,
  address_line_2 text,
  town text not null,
  postcode text not null,
  map_url text check (map_url is null or map_url ~ '^https://'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_published boolean not null default false,
  pickup_enabled boolean not null default false,
  ordering_status text not null default 'closed' check (ordering_status in ('open', 'paused', 'closed')),
  ordering_message text check (char_length(ordering_message) <= 300),
  orders_open_at timestamptz,
  orders_close_at timestamptz,
  pickup_lead_minutes integer not null default 20 check (pickup_lead_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (orders_close_at is null or orders_close_at <= ends_at),
  check (orders_open_at is null or orders_open_at < coalesce(orders_close_at, ends_at))
);

create index events_upcoming_idx on public.events (starts_at) where is_published;
create trigger events_updated_at before update on public.events
for each row execute function private.set_updated_at();

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update, delete on public.events to authenticated;
grant all on public.events to service_role;

create policy events_read on public.events for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy events_admin_write on public.events for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;