begin;

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  price_pence integer not null check (price_pence between 0 and 100000),
  image_path text,
  image_alt text not null default '',
  dietary_tags text[] not null default '{}',
  allergens text[] not null default '{}',
  allergen_note text not null default '',
  is_published boolean not null default false,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  archived_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dietary_tags <@ array['vegetarian', 'vegan', 'gluten-free', 'dairy-free']),
  check (allergens <@ array['celery', 'cereals-containing-gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'peanuts', 'sesame', 'soya', 'sulphur-dioxide-sulphites', 'tree-nuts'])
);

create index menu_items_category_idx on public.menu_items (category_id, sort_order);
create trigger menu_items_updated_at before update on public.menu_items
for each row execute function private.set_updated_at();

alter table public.menu_items enable row level security;
revoke all on public.menu_items from anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant insert, update, delete on public.menu_items to authenticated;
grant all on public.menu_items to service_role;

create policy menu_items_read on public.menu_items for select to anon, authenticated
using ((select private.is_admin()) or (
  is_published and archived_at is null and exists (
    select 1 from public.menu_categories where id = category_id and is_published
  )
));
create policy menu_items_admin_write on public.menu_items for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;