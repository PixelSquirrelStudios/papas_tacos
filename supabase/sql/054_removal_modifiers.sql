begin;

lock table public.modifier_groups, public.modifier_options in share row exclusive mode;

alter table public.modifier_groups
  add column group_type text not null default 'standard' check (group_type in ('standard', 'removal')),
  add constraint removal_group_limits check (
    group_type <> 'removal' or (min_selections = 0 and max_selections = 30 and cardinality(child_group_ids) = 0)
  );

alter table public.order_item_modifiers
  add column group_type text not null default 'standard' check (group_type in ('standard', 'removal')),
  add constraint removal_snapshot_values check (
    group_type <> 'removal' or (unit_price_pence = 0 and linked_menu_item_id is null and cardinality(allergen_snapshot) = 0)
  );

create function private.validate_removal_groups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.modifier_groups parent
    join public.modifier_groups child on child.id = any(parent.child_group_ids)
    where child.group_type = 'removal'
  ) then raise exception 'Removal groups must be attached directly to menu items, not nested inside other groups'; end if;
  if exists (
    select 1 from public.modifier_options o join public.modifier_groups g on g.id = o.modifier_group_id
    where g.group_type = 'removal' and (
      o.price_pence <> 0 or o.linked_menu_item_id is not null or o.pricing_mode <> 'extra'
      or o.linked_quantity <> 1 or cardinality(o.allergens) <> 0
    )
  ) then raise exception 'Removal options must be free, unlinked ingredients with no added allergens'; end if;
  if exists (
    select 1 from public.modifier_groups g join public.modifier_options o on o.modifier_group_id = g.id
    where g.group_type = 'removal' group by g.id having count(*) > 30
  ) then raise exception 'A removal group can contain at most 30 ingredients'; end if;
  return null;
end;
$$;
revoke all on function private.validate_removal_groups() from public, anon, authenticated, service_role;
create trigger removal_groups_validate after insert or update on public.modifier_groups
  for each statement execute function private.validate_removal_groups();
create trigger removal_options_validate after insert or update on public.modifier_options
  for each statement execute function private.validate_removal_groups();

create or replace function private.quote_modifier_choices(item_uuid uuid, selections jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  selected text[];
  choices jsonb;
begin
  if jsonb_typeof(selections) is distinct from 'array' or jsonb_array_length(selections) > 100 then raise exception 'Invalid choices'; end if;
  if exists (select 1 from jsonb_array_elements(selections) entry where jsonb_typeof(entry) <> 'string') then raise exception 'Invalid choices'; end if;
  select coalesce(array_agg(value), '{}') into selected from jsonb_array_elements_text(selections);
  if cardinality(selected) <> (select count(distinct choice) from unnest(selected) choice) then raise exception 'A selected choice is no longer available'; end if;
  if (select count(*) from private.item_modifier_groups(item_uuid)) > 100 then raise exception 'Too many nested modifier groups'; end if;
  if exists (select 1 from public.menu_items where id = item_uuid and item_kind = 'group')
    and not exists (
      select 1 from private.item_modifier_groups(item_uuid) g
      join public.modifier_options o on o.modifier_group_id = g.group_id
      where g.min_selections > 0
    ) then raise exception 'Group items require at least one required choice with options'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'selection_key', case when g.depth = 0 then o.id::text else g.group_key || ':' || o.id::text end,
    'option_id', o.id, 'group_key', g.group_key, 'group_name', g.group_name, 'group_type', definition.group_type,
    'option_name', case when definition.group_type = 'removal' then 'No ' || o.name when linked.id is null then o.name else linked.name end,
    'price_pence', case when o.pricing_mode = 'item' then linked.price_pence * o.linked_quantity else o.price_pence end,
    'allergens', case when linked.id is null then o.allergens else linked.allergens end,
    'linked_menu_item_id', linked.id, 'linked_quantity', o.linked_quantity
  ) order by g.group_key, o.sort_order, o.id), '[]') into choices
  from private.item_modifier_groups(item_uuid) g
  join public.modifier_groups definition on definition.id = g.group_id
  join public.modifier_options o on o.modifier_group_id = g.group_id
  left join public.menu_items linked on linked.id = o.linked_menu_item_id
  where o.is_available and (
    o.linked_menu_item_id is null or (
      linked.item_kind = 'product' and linked.is_published and linked.is_available and linked.archived_at is null
      and exists (select 1 from public.menu_categories c where c.id = linked.category_id and c.is_published)
      and not exists (select 1 from public.menu_item_modifier_groups a where a.menu_item_id = linked.id)
    )
  ) and (case when g.depth = 0 then o.id::text else g.group_key || ':' || o.id::text end) = any(selected);
  if jsonb_array_length(choices) <> cardinality(selected) then raise exception 'A selected choice is no longer available'; end if;
  if exists (
    select 1 from private.item_modifier_groups(item_uuid) g
    where (select count(*) from jsonb_array_elements(choices) choice where choice->>'group_key' = g.group_key)
      not between g.min_selections and g.max_selections
  ) then raise exception 'Review the required choices for your items'; end if;
  if exists (select 1 from public.menu_items where id = item_uuid and item_kind = 'group')
    and not exists (
      select 1 from jsonb_array_elements(choices) choice
      where choice->>'linked_menu_item_id' is not null
    ) then raise exception 'Group items require at least one selected linked product'; end if;
  return choices;
end;
$$;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('allergen_snapshot, linked_menu_item_id, linked_quantity)' in definition) = 0
    or position('(choice->>''linked_quantity'')::integer' in definition) = 0 then
    raise exception 'Unexpected checkout implementation; apply migrations through 053 before 054';
  end if;
  definition := replace(definition,
    'allergen_snapshot, linked_menu_item_id, linked_quantity)',
    'allergen_snapshot, linked_menu_item_id, linked_quantity, group_type)');
  definition := replace(definition,
    '(choice->>''linked_quantity'')::integer',
    '(choice->>''linked_quantity'')::integer, choice->>''group_type''');
  execute definition;
end;
$$;

notify pgrst, 'reload schema';
commit;
