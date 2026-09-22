begin;

create table public.menu_item_modifier_groups (
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  modifier_group_id uuid not null references public.modifier_groups(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (menu_item_id, modifier_group_id)
);

create index menu_item_modifier_groups_group_idx on public.menu_item_modifier_groups (modifier_group_id);

alter table public.menu_item_modifier_groups enable row level security;
revoke all on public.menu_item_modifier_groups from anon, authenticated;
grant select on public.menu_item_modifier_groups to anon, authenticated;
grant insert, update, delete on public.menu_item_modifier_groups to authenticated;
grant all on public.menu_item_modifier_groups to service_role;

create policy menu_item_modifier_groups_read on public.menu_item_modifier_groups for select to anon, authenticated
using ((select private.is_admin()) or (
  exists (select 1 from public.menu_items where id = menu_item_id)
  and exists (select 1 from public.modifier_groups where id = modifier_group_id and is_published)
));
create policy menu_item_modifier_groups_admin_write on public.menu_item_modifier_groups for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;