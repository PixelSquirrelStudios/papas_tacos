begin;

alter table public.modifier_groups add column if not exists child_group_ids uuid[] not null default '{}';

create or replace function private.guard_modifier_group_nesting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('modifier-group-nesting', 0));
  if tg_op = 'DELETE' then
    if exists (select 1 from public.modifier_groups where old.id = any(child_group_ids) and id <> old.id) then
      raise exception 'Remove this group from its parent groups before deleting';
    end if;
    return old;
  end if;
  if cardinality(new.child_group_ids) > 30 or array_position(new.child_group_ids, null) is not null
    or cardinality(new.child_group_ids) <> (select count(distinct child) from unnest(new.child_group_ids) child)
    or new.id = any(new.child_group_ids) then raise exception 'Invalid nested modifier groups'; end if;
  if exists (select 1 from unnest(new.child_group_ids) child where not exists (select 1 from public.modifier_groups where id = child)) then
    raise exception 'A nested modifier group no longer exists';
  end if;
  if exists (
    with recursive nodes as (
      select id, child_group_ids from public.modifier_groups where id <> new.id
      union all select new.id, new.child_group_ids
    ), paths as (
      select id, child_group_ids, array[id] as path, false as cycle from nodes
      union all
      select child.id, child.child_group_ids, parent.path || child.id, child.id = any(parent.path)
      from paths parent join nodes child on child.id = any(parent.child_group_ids)
      where not parent.cycle and cardinality(parent.path) < 4
    ) select 1 from paths where cycle or cardinality(path) > 3
  ) then raise exception 'Nested groups must be acyclic and no more than three levels deep'; end if;
  return new;
end;
$$;
revoke all on function private.guard_modifier_group_nesting() from public, anon, authenticated;
drop trigger if exists modifier_group_nesting_guard on public.modifier_groups;
create trigger modifier_group_nesting_guard before insert or update of child_group_ids or delete on public.modifier_groups
for each row execute function private.guard_modifier_group_nesting();

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

notify pgrst, 'reload schema';
commit;