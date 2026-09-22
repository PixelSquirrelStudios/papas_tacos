begin;

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer not null default 1 check (max_selections between 1 and 30),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_selections <= max_selections)
);

create trigger modifier_groups_updated_at before update on public.modifier_groups
for each row execute function private.set_updated_at();

alter table public.modifier_groups enable row level security;
revoke all on public.modifier_groups from anon, authenticated;
grant select on public.modifier_groups to anon, authenticated;
grant insert, update, delete on public.modifier_groups to authenticated;
grant all on public.modifier_groups to service_role;

create policy modifier_groups_read on public.modifier_groups for select to anon, authenticated
using (is_published or (select private.is_admin()));
create policy modifier_groups_admin_write on public.modifier_groups for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;