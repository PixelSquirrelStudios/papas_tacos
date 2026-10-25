begin;

alter table public.menu_items
  add column if not exists excluded_modifier_group_paths text[] not null default '{}';

create or replace function private.guard_item_modifier_overrides()
returns trigger language plpgsql set search_path = '' as $$
begin
  if cardinality(new.excluded_modifier_group_paths) > 100
    or exists (
      select 1 from unnest(new.excluded_modifier_group_paths) path
      where path is null or path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}){1,2}$'
    )
    or cardinality(new.excluded_modifier_group_paths) <> (select count(distinct path) from unnest(new.excluded_modifier_group_paths) path)
  then raise exception 'Invalid nested modifier assignment'; end if;
  return new;
end;
$$;
revoke all on function private.guard_item_modifier_overrides() from public, anon, authenticated, service_role;
drop trigger if exists item_modifier_overrides_guard on public.menu_items;
create trigger item_modifier_overrides_guard before insert or update of excluded_modifier_group_paths on public.menu_items
  for each row execute function private.guard_item_modifier_overrides();

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
      and not array_to_string(parent.path || child.id, '/') = any(
        select unnest(item.excluded_modifier_group_paths) from public.menu_items item where item.id = item_uuid
      )
  ) select id, array_to_string(path, '/'), label, min_selections, max_selections, cardinality(path) - 1 from tree;
$$;
revoke all on function private.item_modifier_groups(uuid) from public, anon, authenticated;
grant execute on function private.item_modifier_groups(uuid) to service_role;

create or replace function public.admin_assign_modifier_groups_overrides(
  item_id uuid, group_ids uuid[], expected_updated_at timestamptz, excluded_paths text[]
)
returns public.menu_items language plpgsql security invoker set search_path = '' as $$
declare saved public.menu_items%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform public.admin_assign_modifier_groups(item_id, group_ids, expected_updated_at);
  update public.menu_items set excluded_modifier_group_paths = excluded_paths where id = item_id returning * into saved;
  return saved;
end;
$$;

create or replace function public.admin_save_menu_item_overrides(
  item_id uuid, expected_updated_at timestamptz, item_values jsonb, group_ids uuid[], excluded_paths text[]
)
returns public.menu_items language plpgsql security invoker set search_path = '' as $$
declare saved public.menu_items%rowtype;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  saved := public.admin_save_menu_item(item_id, expected_updated_at, item_values, group_ids);
  update public.menu_items set excluded_modifier_group_paths = excluded_paths where id = saved.id returning * into saved;
  return saved;
end;
$$;
revoke all on function public.admin_assign_modifier_groups_overrides(uuid,uuid[],timestamptz,text[]) from public, anon;
revoke all on function public.admin_save_menu_item_overrides(uuid,timestamptz,jsonb,uuid[],text[]) from public, anon;
grant execute on function public.admin_assign_modifier_groups_overrides(uuid,uuid[],timestamptz,text[]) to authenticated;
grant execute on function public.admin_save_menu_item_overrides(uuid,timestamptz,jsonb,uuid[],text[]) to authenticated;

notify pgrst, 'reload schema';
commit;
