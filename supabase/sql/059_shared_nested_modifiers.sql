begin;

lock table public.menu_items, public.modifier_groups, public.menu_item_modifier_groups in share row exclusive mode;

create or replace function private.item_modifier_groups(item_uuid uuid)
returns table(group_id uuid, group_key text, group_name text, min_selections integer, max_selections integer, depth integer)
language sql stable set search_path = '' as $$
  with recursive tree as (
    select groups.id, groups.child_group_ids, array[groups.id] as path, groups.name::text as label, groups.min_selections, groups.max_selections
    from public.menu_item_modifier_groups links join public.modifier_groups groups on groups.id = links.modifier_group_id
    where links.menu_item_id = item_uuid and groups.is_published
    union all
    select child.id, child.child_group_ids, parent.path || child.id, parent.label || ' / ' || child.name, child.min_selections, child.max_selections
    from tree parent join public.modifier_groups child on child.id = any(parent.child_group_ids)
    where child.is_published and not child.id = any(parent.path) and cardinality(parent.path) < 3
  ) select id, array_to_string(path, '/'), label, min_selections, max_selections, cardinality(path) - 1 from tree;
$$;
revoke all on function private.item_modifier_groups(uuid) from public, anon, authenticated;
grant execute on function private.item_modifier_groups(uuid) to service_role;

drop function if exists public.admin_assign_modifier_groups_overrides(uuid,uuid[],timestamptz,text[]);
drop function if exists public.admin_save_menu_item_overrides(uuid,timestamptz,jsonb,uuid[],text[]);
drop trigger if exists item_modifier_overrides_guard on public.menu_items;
drop function if exists private.guard_item_modifier_overrides();
alter table public.menu_items drop column if exists excluded_modifier_group_paths;

notify pgrst, 'reload schema';
commit;
