begin;

alter table public.modifier_groups add column if not exists sort_order integer not null default 0;

create or replace function public.admin_reorder(resource text, ordered_ids uuid[], expected_ids uuid[], scope_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  scope_column text;
  actual_ids uuid[];
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if resource is null or resource not in ('menu_items', 'menu_categories', 'modifier_groups', 'modifier_options', 'testimonials', 'events') then
    raise exception 'Unsupported ordering resource';
  end if;
  if ordered_ids is null or expected_ids is null or cardinality(ordered_ids) > 10000
    or array_position(ordered_ids, null) is not null or array_position(expected_ids, null) is not null
    or cardinality(ordered_ids) <> (select count(distinct value) from unnest(ordered_ids) value)
    or not (ordered_ids @> expected_ids and expected_ids @> ordered_ids)
    or cardinality(ordered_ids) <> cardinality(expected_ids) then
    raise exception 'Invalid ordering list';
  end if;
  scope_column := case resource when 'menu_items' then 'category_id' when 'modifier_options' then 'modifier_group_id' end;
  if scope_column is not null and scope_id is null then raise exception 'Choose an ordering scope'; end if;
  if scope_column is null and scope_id is not null then raise exception 'Unexpected ordering scope'; end if;
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

commit;