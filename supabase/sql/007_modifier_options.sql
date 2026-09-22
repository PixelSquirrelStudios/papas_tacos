begin;

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  price_pence integer not null default 0 check (price_pence between 0 and 100000),
  allergens text[] not null default '{}',
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (allergens <@ array['celery', 'cereals-containing-gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'peanuts', 'sesame', 'soya', 'sulphur-dioxide-sulphites', 'tree-nuts'])
);

create index modifier_options_group_idx on public.modifier_options (modifier_group_id, sort_order);
create trigger modifier_options_updated_at before update on public.modifier_options
for each row execute function private.set_updated_at();

alter table public.modifier_options enable row level security;
revoke all on public.modifier_options from anon, authenticated;
grant select on public.modifier_options to anon, authenticated;
grant insert, update, delete on public.modifier_options to authenticated;
grant all on public.modifier_options to service_role;

create policy modifier_options_read on public.modifier_options for select to anon, authenticated
using ((select private.is_admin()) or exists (
  select 1 from public.modifier_groups where id = modifier_group_id and is_published
));
create policy modifier_options_admin_write on public.modifier_options for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;