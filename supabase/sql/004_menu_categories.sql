begin;

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger menu_categories_updated_at before update on public.menu_categories
for each row execute function private.set_updated_at();

alter table public.menu_categories enable row level security;
revoke all on public.menu_categories from anon, authenticated;
grant select on public.menu_categories to anon, authenticated;
grant insert, update, delete on public.menu_categories to authenticated;
grant all on public.menu_categories to service_role;

create policy menu_categories_read on public.menu_categories for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy menu_categories_admin_write on public.menu_categories for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;