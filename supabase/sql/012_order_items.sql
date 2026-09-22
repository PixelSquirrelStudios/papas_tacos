begin;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete restrict,
  item_name text not null check (char_length(item_name) between 1 and 120),
  quantity integer not null check (quantity between 1 and 99),
  unit_price_pence integer not null check (unit_price_pence between 0 and 100000),
  unit_extras_pence integer not null default 0 check (unit_extras_pence between 0 and 100000),
  line_total_pence integer generated always as (quantity * (unit_price_pence + unit_extras_pence)) stored,
  allergen_snapshot text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_menu_item_idx on public.order_items (menu_item_id);

alter table public.order_items enable row level security;
revoke all on public.order_items from anon, authenticated;
grant select on public.order_items to authenticated;
grant all on public.order_items to service_role;

create policy order_items_read on public.order_items for select to authenticated
using (exists (select 1 from public.orders where id = order_id));

commit;