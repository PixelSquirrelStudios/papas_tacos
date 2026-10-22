begin;

lock table public.menu_categories, public.menu_items, public.modifier_groups,
  public.modifier_options, public.menu_item_modifier_groups in share row exclusive mode;
lock table public.orders, public.order_items, public.order_item_modifiers in share row exclusive mode;
select private.inventory_lock();

do $$
begin
  if exists (select 1 from public.orders
    where status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup')) then
    raise exception 'Linked menu items migration requires an ordering maintenance window: reconcile or complete all active orders, then retry 051_linked_menu_items.sql after 050_inventory.sql';
  end if;
end;
$$;

alter table public.menu_items
  add column item_kind text not null default 'product' check (item_kind in ('product', 'group')),
  add column show_standalone boolean not null default true,
  add constraint menu_items_group_price check (item_kind <> 'group' or price_pence = 0);

alter table public.modifier_options
  add column linked_menu_item_id uuid references public.menu_items(id) on delete restrict,
  add column linked_quantity integer not null default 1 check (linked_quantity between 1 and 99),
  add column pricing_mode text not null default 'extra' check (pricing_mode in ('extra', 'item')),
  add constraint modifier_options_link_pricing check (
    (linked_menu_item_id is not null or (pricing_mode = 'extra' and linked_quantity = 1))
    and (pricing_mode <> 'item' or price_pence = 0));
create index modifier_options_linked_item_idx on public.modifier_options(linked_menu_item_id);

alter table public.order_item_modifiers
  add column linked_menu_item_id uuid references public.menu_items(id) on delete restrict,
  add column linked_quantity integer not null default 1 check (linked_quantity between 1 and 99),
  add constraint order_item_modifiers_link_quantity check (linked_menu_item_id is not null or linked_quantity = 1);
alter table public.order_item_modifiers
  drop constraint order_item_modifiers_unit_price_pence_check,
  add constraint order_item_modifiers_unit_price_pence_check check (unit_price_pence between 0 and 9900000);
alter table public.order_items
  drop constraint order_items_unit_extras_pence_check,
  add constraint order_items_unit_extras_pence_check check (unit_extras_pence between 0 and 10000000);

-- Catalogue writers and inventory configuration share the checkout serialization lock.
create function private.linked_catalogue_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('modifier-group-nesting', 0));
  perform private.inventory_lock();
  return null;
end;
$$;

create function private.validate_linked_catalogue()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.menu_set_items entry join public.menu_items i on i.id = entry.menu_item_id
    where i.item_kind = 'group' and coalesce(entry.price_pence, 0) <> 0
  ) then raise exception 'Group items must have zero base price, including menu-set overrides'; end if;
  if exists (
    select 1 from public.modifier_options o join public.menu_items i on i.id = o.linked_menu_item_id
    where i.item_kind <> 'product'
      or exists (select 1 from public.menu_item_modifier_groups g where g.menu_item_id = i.id)
  ) then
    raise exception 'Linked choices must target a simple product without any modifier groups';
  end if;
  if exists (
    select 1 from public.menu_items i join public.inventory_items stock on stock.menu_item_id = i.id
    where i.item_kind = 'group' and (
      stock.tracking_mode <> 'none' or stock.on_hand <> 0
      or exists (select 1 from public.inventory_allocations a where a.menu_item_id = i.id)
      or exists (select 1 from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = i.id and o.status in ('pending_payment','ordered','preparing','ready_for_pickup'))
    )
  ) then
    raise exception 'Group items cannot track inventory; reconcile product stock and allocations before converting to a group';
  end if;
  return null;
end;
$$;
revoke all on function private.linked_catalogue_lock(), private.validate_linked_catalogue()
  from public, anon, authenticated, service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array['menu_items','modifier_options','modifier_groups','menu_item_modifier_groups','menu_set_items'] loop
    execute format('create trigger linked_catalogue_serialize before insert or update or delete on public.%I
      for each statement execute function private.linked_catalogue_lock()', table_name);
    execute format('create trigger linked_catalogue_validate after insert or update or delete on public.%I
      for each statement execute function private.validate_linked_catalogue()', table_name);
  end loop;
end;
$$;
create trigger linked_inventory_serialize before insert or update or delete on public.inventory_items
  for each statement execute function private.inventory_lock_statement();
create trigger linked_inventory_validate after insert or update on public.inventory_items
  for each statement execute function private.validate_linked_catalogue();
create trigger linked_allocations_validate after insert or update on public.inventory_allocations
  for each statement execute function private.validate_linked_catalogue();

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
    'option_id', o.id, 'group_key', g.group_key, 'group_name', g.group_name,
    'option_name', case when linked.id is null then o.name else linked.name end,
    'price_pence', case when o.pricing_mode = 'item' then linked.price_pence * o.linked_quantity else o.price_pence end,
    'allergens', case when linked.id is null then o.allergens else linked.allergens end,
    'linked_menu_item_id', linked.id, 'linked_quantity', o.linked_quantity
  ) order by g.group_key, o.sort_order, o.id), '[]') into choices
  from private.item_modifier_groups(item_uuid) g
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

-- Reuse 050's locked, incremental accounting for each immutable consumed product.
do $$
declare definition text;
begin
  select pg_get_functiondef('private.inventory_capture_order_item()'::regprocedure) into definition;
  definition := replace(definition, 'private.inventory_capture_order_item()', 'private.inventory_consume(order_uuid uuid, item_uuid uuid, consumed_quantity integer)');
  definition := replace(definition, 'RETURNS trigger', 'RETURNS void');
  definition := replace(definition, 'new.order_id', 'order_uuid');
  definition := replace(definition, 'new.menu_item_id', 'item_uuid');
  definition := replace(definition, 'new.quantity', 'consumed_quantity');
  definition := replace(definition, 'return new;', 'return;');
  execute definition;
end;
$$;
revoke all on function private.inventory_consume(uuid,uuid,integer) from public, anon, authenticated, service_role;

drop trigger order_items_inventory_hold on public.order_items;
create constraint trigger order_items_inventory_hold after insert on public.order_items
  deferrable initially deferred for each row execute function private.inventory_capture_order_item();

create function private.inventory_capture_linked_choice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare line public.order_items%rowtype;
begin
  if new.linked_menu_item_id is not null then
    select * into strict line from public.order_items where id = new.order_item_id;
    perform private.inventory_consume(line.order_id, new.linked_menu_item_id, new.linked_quantity * line.quantity);
  end if;
  return new;
end;
$$;
revoke all on function private.inventory_capture_linked_choice() from public, anon, authenticated, service_role;
create constraint trigger order_item_modifiers_inventory_hold after insert on public.order_item_modifiers
  deferrable initially deferred for each row execute function private.inventory_capture_linked_choice();

create function private.protect_checkout_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
declare order_uuid uuid;
begin
  perform private.inventory_lock();
  if tg_op <> 'INSERT' then raise exception 'Order item inventory snapshots are immutable'; end if;
  if tg_table_name = 'order_items' then
    order_uuid := new.order_id;
  else
    select order_id into order_uuid from public.order_items where id = new.order_item_id;
  end if;
  if not exists (
    select 1 from private.inventory_order_transactions t join public.orders o on o.id = t.order_id
    where t.order_id = order_uuid and t.transaction_id = pg_current_xact_id()
      and o.status in ('pending_payment','ordered') and o.payment_status = 'unpaid'
  ) then raise exception 'Order item inventory snapshots are immutable'; end if;
  return new;
end;
$$;
revoke all on function private.protect_checkout_lines() from public, anon, authenticated, service_role;
create trigger order_items_checkout_guard before insert or update or delete on public.order_items
  for each row execute function private.protect_checkout_lines();
create trigger order_item_modifiers_checkout_guard before insert or update or delete on public.order_item_modifiers
  for each row execute function private.protect_checkout_lines();
create trigger inventory_serialize before insert or update or delete on public.order_item_modifiers
  for each statement execute function private.inventory_lock_statement();

-- Keep all checkout upgrades, including menu-set prices and profile repair.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('private.menu_set_price' in definition) = 0 or position('private.inventory_lock()' in definition) = 0 then
    raise exception 'Unexpected checkout implementation; apply migrations through 050 before 051';
  end if;
  definition := replace(definition, 'and is_published and is_available and archived_at is null',
    'and is_published and is_available and archived_at is null and show_standalone');
  definition := replace(definition, 'item_record.price_pence := private.menu_set_price(',
    'if item_record.item_kind = ''group'' and private.menu_set_price(
      case when nullif(payload->>''slotId'', '''') is not null then
        (select event_id from public.pickup_slots where id=(payload->>''slotId'')::uuid)
      else (payload->>''eventId'')::uuid end, item_record.id) <> 0 then
      raise exception ''Group items must have zero base price, including menu-set overrides'';
    end if;
    item_record.price_pence := private.menu_set_price(');
  definition := replace(definition,
    'selection_key, group_name, option_name, unit_price_pence, allergen_snapshot)',
    'selection_key, group_name, option_name, unit_price_pence, allergen_snapshot, linked_menu_item_id, linked_quantity)');
  definition := replace(definition,
    'array(select value from jsonb_array_elements_text(choice->''allergens''))',
    'array(select value from jsonb_array_elements_text(choice->''allergens'')), (choice->>''linked_menu_item_id'')::uuid, (choice->>''linked_quantity'')::integer');
  execute definition;
end;
$$;

do $$
declare definition text;
begin
  select pg_get_functiondef('private.inventory_protect_order()'::regprocedure) into definition;
  definition := replace(definition,
    'exists (select 1 from public.inventory_order_stock where order_id = old.id) and (',
    '(');
  execute definition;
  select pg_get_functiondef('public.admin_inventory_action(uuid,uuid,text,integer,bigint,text,text,text,uuid)'::regprocedure) into definition;
  definition := replace(definition, 'where line.menu_item_id = item_uuid',
    'where (line.menu_item_id = item_uuid or exists (
      select 1 from public.order_item_modifiers choice
      where choice.order_item_id = line.id and choice.linked_menu_item_id = item_uuid))');
  execute definition;
  select pg_get_functiondef('public.admin_save_menu_item(uuid,timestamptz,jsonb,uuid[])'::regprocedure) into definition;
  definition := replace(definition, '''is_crowd_favourite''', '''is_crowd_favourite'', ''item_kind'', ''show_standalone''');
  definition := replace(definition, 'supplied := jsonb_populate_record',
    'item_values := jsonb_build_object(''item_kind'', ''product'', ''show_standalone'', true) || item_values;
  supplied := jsonb_populate_record');
  definition := replace(definition, 'is_featured, is_crowd_favourite)',
    'is_featured, is_crowd_favourite, item_kind, show_standalone)');
  definition := replace(definition, 'supplied.is_featured, supplied.is_crowd_favourite)',
    'supplied.is_featured, supplied.is_crowd_favourite, supplied.item_kind, supplied.show_standalone)');
  definition := replace(definition, 'is_crowd_favourite = supplied.is_crowd_favourite',
    'is_crowd_favourite = supplied.is_crowd_favourite, item_kind = supplied.item_kind, show_standalone = supplied.show_standalone');
  execute definition;
end;
$$;

notify pgrst, 'reload schema';
commit;
