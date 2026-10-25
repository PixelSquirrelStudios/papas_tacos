begin;

lock table public.menu_items, public.menu_item_modifier_groups, public.modifier_groups, public.modifier_options in share row exclusive mode;

create or replace function private.validate_removal_groups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.modifier_options o join public.modifier_groups g on g.id = o.modifier_group_id
    where g.group_type = 'removal' and (
      o.linked_menu_item_id is not null or o.pricing_mode <> 'extra'
      or o.linked_quantity <> 1 or cardinality(o.allergens) <> 0
    )
  ) then raise exception 'Removals and Other Options must be unlinked choices with no added allergens'; end if;
  if exists (
    select 1 from public.modifier_groups g join public.modifier_options o on o.modifier_group_id = g.id
    where g.group_type = 'removal' group by g.id having count(*) > 30
  ) then raise exception 'A Removals and Other Options group can contain at most 30 options'; end if;
  return null;
end;
$$;
revoke all on function private.validate_removal_groups() from public, anon, authenticated, service_role;

-- Shared taco meals use the same options even when only one has a direct assignment.
insert into public.menu_item_modifier_groups(menu_item_id, modifier_group_id, sort_order)
select distinct target.id, options.modifier_group_id, options.sort_order
from public.menu_items source
join public.menu_item_modifier_groups options on options.menu_item_id = source.id
join public.modifier_groups definition on definition.id = options.modifier_group_id and definition.group_type = 'removal'
join public.menu_item_modifier_groups source_parent on source_parent.menu_item_id = source.id
join public.modifier_groups filling on filling.id = source_parent.modifier_group_id
  and filling.group_type = 'standard' and lower(filling.name) ~ '^taco [1-3]( filling)?$'
join public.menu_item_modifier_groups target_parent on target_parent.modifier_group_id = filling.id
join public.menu_items target on target.id = target_parent.menu_item_id and target.id <> source.id
where source.slug in ('two-tacos', 'three-tacos') and target.slug in ('two-tacos', 'three-tacos')
  and not exists (
    select 1 from public.menu_item_modifier_groups existing
    join public.modifier_groups g on g.id = existing.modifier_group_id
    where existing.menu_item_id = target.id and g.group_type = 'removal'
  )
on conflict (menu_item_id, modifier_group_id) do nothing;

-- Move only recognised taco meals; reject ambiguous shared-parent configurations.
do $$
declare
  meal record;
  parent record;
  option_groups uuid[];
  other_groups uuid[];
  parents uuid[];
begin
  for meal in select id, slug from public.menu_items where slug in ('two-tacos', 'three-tacos') loop
    select array_agg(g.id order by a.sort_order, g.id) into option_groups
    from public.menu_item_modifier_groups a join public.modifier_groups g on g.id = a.modifier_group_id
    where a.menu_item_id = meal.id and g.group_type = 'removal';
    if option_groups is null then continue; end if;
    select array_agg(g.id order by a.sort_order, g.id) into parents
    from public.menu_item_modifier_groups a join public.modifier_groups g on g.id = a.modifier_group_id
    where a.menu_item_id = meal.id and g.group_type = 'standard'
      and lower(g.name) ~ '^taco [1-3]( filling)?$';
    if coalesce(cardinality(parents), 0) <> (case when meal.slug = 'two-tacos' then 2 else 3 end) then
      raise exception 'Cannot safely move options for %: expected separate Taco N filling groups. Configure per-taco groups before retrying.', meal.slug;
    end if;
    for parent in select distinct a.menu_item_id, a.modifier_group_id from public.menu_item_modifier_groups a
      where a.modifier_group_id = any(parents) and a.menu_item_id <> meal.id
    loop
      if not exists (select 1 from public.menu_items where id = parent.menu_item_id and slug in ('two-tacos', 'three-tacos')) then
        raise exception 'Taco groups are shared with another menu item. Separate these groups before migrating per-taco options.';
      end if;
      select array_agg(g.id order by a.sort_order, g.id) into other_groups
      from public.menu_item_modifier_groups a join public.modifier_groups g on g.id = a.modifier_group_id
      where a.menu_item_id = parent.menu_item_id and g.group_type = 'removal';
      if other_groups is not null and not (other_groups @> option_groups and option_groups @> other_groups) then
        raise exception 'Taco meals share filling groups but have different overall options. Separate their filling groups before migrating.';
      end if;
      if other_groups is null and exists (
        select 1 from public.modifier_groups g where g.id = parent.modifier_group_id and not (g.child_group_ids @> option_groups)
      ) then
        raise exception 'A shared taco meal has no matching options. Configure matching options or separate its filling groups before migrating.';
      end if;
    end loop;
    update public.modifier_groups g set child_group_ids = g.child_group_ids || array(
      select option_id from unnest(option_groups) option_id where not option_id = any(g.child_group_ids)
    ) where g.id = any(parents);
    delete from public.menu_item_modifier_groups where menu_item_id = meal.id and modifier_group_id = any(option_groups);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
