begin;

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  modifier_option_id uuid references public.modifier_options(id) on delete set null,
  group_name text not null,
  option_name text not null,
  unit_price_pence integer not null check (unit_price_pence between 0 and 100000),
  allergen_snapshot text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (order_item_id, modifier_option_id)
);

create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);
create index order_item_modifiers_option_idx on public.order_item_modifiers (modifier_option_id);

alter table public.order_item_modifiers enable row level security;
revoke all on public.order_item_modifiers from anon, authenticated;
grant select on public.order_item_modifiers to authenticated;
grant all on public.order_item_modifiers to service_role;

create policy order_item_modifiers_read on public.order_item_modifiers for select to authenticated
using (exists (select 1 from public.order_items where id = order_item_id));

commit;