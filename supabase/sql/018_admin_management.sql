begin;

alter table public.events add column if not exists sort_order integer not null default 0;
alter table public.testimonials add column if not exists image_path text;
alter table public.testimonials add column if not exists image_alt text not null default '';

create or replace function public.admin_reorder(resource text, ordered_ids uuid[], expected_ids uuid[], scope_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  scope_column text;
  actual_ids uuid[];
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if resource is null or resource not in ('menu_items', 'menu_categories', 'modifier_options', 'testimonials', 'events') then
    raise exception 'Unsupported ordering resource';
  end if;
  if ordered_ids is null or expected_ids is null or cardinality(ordered_ids) > 10000
    or array_position(ordered_ids, null) is not null
    or cardinality(ordered_ids) <> (select count(distinct value) from unnest(ordered_ids) value)
    or not (ordered_ids @> expected_ids and expected_ids @> ordered_ids)
    or cardinality(ordered_ids) <> cardinality(expected_ids) then
    raise exception 'Invalid ordering list';
  end if;
  scope_column := case resource when 'menu_items' then 'category_id' when 'modifier_options' then 'modifier_group_id' end;
  if scope_column is not null and scope_id is null then raise exception 'Choose an ordering scope'; end if;
  execute format('lock table public.%I in share row exclusive mode', resource);
  if scope_column is null then
    execute format('select coalesce(array_agg(id order by sort_order, %s id), array[]::uuid[]) from public.%I',
      case when resource = 'events' then 'starts_at, ' else '' end, resource) into actual_ids;
  else
    execute format('select coalesce(array_agg(id order by sort_order, id), array[]::uuid[]) from public.%I where %I = $1', resource, scope_column)
      into actual_ids using scope_id;
  end if;
  if actual_ids is distinct from expected_ids then raise exception 'List changed; refresh before reordering'; end if;
  execute format('update public.%I as target set sort_order = source.position::integer * 10 from unnest($1::uuid[]) with ordinality as source(id, position) where target.id = source.id', resource) using ordered_ids;
end;
$$;
revoke all on function public.admin_reorder(text, uuid[], uuid[], uuid) from public;
grant execute on function public.admin_reorder(text, uuid[], uuid[], uuid) to authenticated;

create or replace function public.admin_assign_modifier_groups(item_id uuid, group_ids uuid[], expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare current_version timestamptz;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select updated_at into current_version from public.menu_items where id = item_id for update;
  if not found then raise exception 'Item not found'; end if;
  if current_version is distinct from expected_updated_at then raise exception 'Item changed; refresh before saving'; end if;
  if group_ids is null or cardinality(group_ids) > 30 or array_position(group_ids, null) is not null
    or cardinality(group_ids) <> (select count(distinct value) from unnest(group_ids) value) then raise exception 'Invalid groups'; end if;
  if (select count(*) from public.modifier_groups where id = any(group_ids)) <> cardinality(group_ids) then raise exception 'Unknown group'; end if;
  delete from public.menu_item_modifier_groups where menu_item_id = item_id;
  insert into public.menu_item_modifier_groups (menu_item_id, modifier_group_id, sort_order)
    select item_id, group_id, position::integer * 10 from unnest(group_ids) with ordinality as source(group_id, position);
  update public.menu_items set updated_at = now() where id = item_id;
end;
$$;
revoke all on function public.admin_assign_modifier_groups(uuid, uuid[], timestamptz) from public;
grant execute on function public.admin_assign_modifier_groups(uuid, uuid[], timestamptz) to authenticated;

commit;