begin;

alter table public.business_settings
  rename column delivery_ordering_enabled to online_ordering_enabled;
alter view public.admin_business_settings
  rename column delivery_ordering_enabled to online_ordering_enabled;

alter table public.orders
  alter column event_id drop not null,
  alter column pickup_starts_at drop not null,
  alter column pickup_ends_at drop not null;

alter table public.inventory_order_stock
  alter column event_id drop not null;

create or replace function private.guard_new_order()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  settings public.business_settings%rowtype;
  event_record public.events%rowtype;
  slot_record public.pickup_slots%rowtype;
  reason text;
  occupied_slots integer;
  location_number text := trim(coalesce(new.checkout_payload->>'locationNumber', ''));
  number_plate text := upper(trim(coalesce(new.checkout_payload->>'numberPlate', '')));
begin
  select * into settings from public.business_settings where singleton for share;
  if new.event_id is null then
    if settings.singleton is null or not settings.online_ordering_enabled then
      raise exception 'Online ordering unavailable';
    end if;
    if new.pickup_slot_id is not null then raise exception 'Online orders do not use pickup slots'; end if;
    new.pickup_starts_at := null;
    new.pickup_ends_at := null;
    new.pickup_location := jsonb_build_object(
      'service_mode', 'pickup',
      'event_title', 'Online Order',
      'venue_name', 'Online Order'
    );
  else
    select * into event_record from public.events where id = new.event_id for share;
    reason := private.event_ordering_reason(settings, event_record);
    if reason <> 'open' then raise exception 'Ordering unavailable: %', reason; end if;
    if event_record.service_mode = 'pickup' then
      select * into slot_record from public.pickup_slots
        where id = new.pickup_slot_id and event_id = new.event_id for update;
      if not found or not slot_record.is_enabled then raise exception 'Pickup slot unavailable'; end if;
      if slot_record.starts_at < event_record.starts_at or slot_record.ends_at > event_record.ends_at
        or slot_record.starts_at <= now() + make_interval(mins => event_record.pickup_lead_minutes) then
        raise exception 'Pickup slot outside trading hours or preparation lead time';
      end if;
      select count(*) into occupied_slots from public.orders where pickup_slot_id = new.pickup_slot_id
        and status <> 'cancelled' and (status <> 'pending_payment' or reservation_expires_at > now());
      if occupied_slots >= slot_record.capacity then raise exception 'Pickup slot is full'; end if;
      new.pickup_starts_at := slot_record.starts_at;
      new.pickup_ends_at := slot_record.ends_at;
    else
      if new.pickup_slot_id is not null then raise exception 'Table and car orders do not use pickup slots'; end if;
      if char_length(location_number) not between 1 and 40 or location_number !~ '^[a-zA-Z0-9 /-]+$'
        or char_length(number_plate) > 20 or (number_plate <> '' and number_plate !~ '^[A-Z0-9 -]+$')
        or (event_record.service_mode = 'table' and number_plate <> '') then
        raise exception 'Enter a valid table or car number';
      end if;
      if new.payment_method <> 'card' then raise exception 'Table and car orders require card payment'; end if;
      new.pickup_starts_at := coalesce(event_record.orders_open_at, event_record.starts_at);
      new.pickup_ends_at := event_record.ends_at;
    end if;
    new.pickup_location := jsonb_build_object(
      'event_title', event_record.title, 'venue_name', event_record.venue_name,
      'address_line_1', event_record.address_line_1, 'address_line_2', event_record.address_line_2,
      'town', event_record.town, 'postcode', event_record.postcode, 'service_mode', event_record.service_mode,
      'location_number', case when event_record.service_mode <> 'pickup' then location_number else '' end,
      'number_plate', case when event_record.service_mode = 'car' then number_plate else '' end
    );
  end if;
  if new.customer_id is null then raise exception 'A customer account is required to place an order'; end if;
  if new.payment_status <> 'unpaid' then raise exception 'New orders must start unpaid'; end if;
  if new.payment_method = 'cash' and (not settings.cash_enabled or new.status <> 'ordered') then
    raise exception 'Cash checkout unavailable or invalid initial status';
  end if;
  if new.payment_method = 'card' and (not settings.card_enabled or new.status <> 'pending_payment'
    or new.reservation_expires_at is null or new.reservation_expires_at <= now()
    or new.reservation_expires_at > now() + interval '30 minutes') then
    raise exception 'Card checkout unavailable or invalid payment reservation';
  end if;
  if new.subtotal_pence < settings.minimum_order_pence then raise exception 'Minimum food order amount not met'; end if;
  if new.service_fee_pence <> settings.service_fee_pence or new.packaging_fee_pence <> settings.packaging_fee_pence then
    raise exception 'Order fees do not match current business settings';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_new_order() from public;

do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  definition := regexp_replace(definition,
    $select_pattern$select[[:space:]]+\*[[:space:]]+into event_record from public\.events where id = \(payload->>'eventId'\)::uuid for share;$select_pattern$,
    $select_replacement$if nullif(payload->>'eventId', '') is null then payment_deadline := now() + interval '30 minutes'; else select * into event_record from public.events where id = (payload->>'eventId')::uuid for share; end if;$select_replacement$);
  definition := regexp_replace(definition,
    $check_pattern$if[[:space:]]+not[[:space:]]+found[[:space:]]+or[[:space:]]+event_record\.service_mode[[:space:]]*=[[:space:]]*'pickup'[[:space:]]+then$check_pattern$,
    $check_replacement$if nullif(payload->>'eventId', '') is not null and (not found or event_record.service_mode = 'pickup') then$check_replacement$);
  definition := replace(definition,
    $before$if payment_deadline <= now() then raise exception 'Ordering unavailable: ordering_ended'; end if;$before$,
    $after$if payment_deadline <= now() then raise exception 'Ordering unavailable: ordering_ended'; end if;
    if nullif(payload->>'eventId', '') is null then payment_deadline := now() + interval '30 minutes'; end if;$after$);
  if position($marker_select$if nullif(payload->>'eventId', '') is null then payment_deadline$marker_select$ in definition) = 0
    or position($marker_check$if nullif(payload->>'eventId', '') is not null and (not found or event_record.service_mode = 'pickup')$marker_check$ in definition) = 0
    or position($marker_deadline$if nullif(payload->>'eventId', '') is null then payment_deadline := now() + interval '30 minutes'; end if;$marker_deadline$ in definition) = 0 then
    raise exception 'Unexpected checkout implementation; apply migrations through 066 before 067';
  end if;
  execute definition;
end;
$$;

create or replace function public.get_event_stock(event_uuid uuid default null, supplied_key text default null)
returns table(menu_item_id uuid, tracking_mode text, available_quantity integer)
language plpgsql stable security definer set search_path = '' as $$
declare event_record public.events%rowtype;
begin
  if event_uuid is not null then
    select * into event_record from public.events where id = event_uuid;
    if not found or not event_record.is_published then raise exception 'Event unavailable' using errcode = '42501'; end if;
    if event_record.is_private and not public.check_event_ordering_access(event_uuid, supplied_key) then
      raise exception 'Event access required' using errcode = '42501';
    end if;
  end if;
  return query
  select i.menu_item_id, i.tracking_mode,
    case
      when i.tracking_mode = 'none' then null::integer
      when event_uuid is null and i.tracking_mode = 'global' then
        greatest(0, i.on_hand - coalesce(alloc.qty, 0) - coalesce(online.qty, 0))
      when event_uuid is null then null::integer
      else case when i.tracking_mode = 'global' then
        greatest(0, least(coalesce(a.remaining - coalesce(eh.qty, 0), 0),
          i.on_hand - coalesce(gh.qty, 0)))
        else greatest(0, coalesce(a.remaining - coalesce(eh.qty, 0), 0)) end
    end
  from public.inventory_items i
  left join public.inventory_allocations a on a.menu_item_id = i.menu_item_id and a.event_id = event_uuid
  left join lateral (
    select sum(allocations.remaining)::integer qty from public.inventory_allocations allocations
    where allocations.menu_item_id = i.menu_item_id
  ) alloc on true
  left join lateral (
    select sum(s.quantity)::integer qty from public.inventory_order_stock s join public.orders o on o.id = s.order_id
    where s.menu_item_id = i.menu_item_id and s.event_id is null and s.state = 'held'
      and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled'
  ) online on true
  left join lateral (
    select sum(s.quantity)::integer qty from public.inventory_order_stock s join public.orders o on o.id = s.order_id
    where s.menu_item_id = i.menu_item_id and s.event_id = event_uuid and s.state = 'held'
      and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled'
  ) eh on true
  left join lateral (
    select sum(s.quantity)::integer qty from public.inventory_order_stock s join public.orders o on o.id = s.order_id
    where s.menu_item_id = i.menu_item_id and s.state = 'held'
      and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled'
  ) gh on true
  order by i.menu_item_id;
end;
$$;
revoke all on function public.get_event_stock(uuid, text) from public;
grant execute on function public.get_event_stock(uuid, text) to anon, authenticated, service_role;

do $$
declare
  definition text;
  before_block text := $before$
  if item.tracking_mode = 'none' then return new; end if;
  is_cash_sale := order_record.payment_method = 'cash' and order_record.status <> 'cancelled';
  select * into allocation from public.inventory_allocations
    where menu_item_id = new.menu_item_id and event_id = order_record.event_id for update;
$before$;
  after_block text := $after$
  if item.tracking_mode = 'none' then return new; end if;
  is_cash_sale := order_record.payment_method = 'cash' and order_record.status <> 'cancelled';
  if order_record.event_id is null then
    if item.tracking_mode <> 'global' or is_cash_sale then
      raise exception 'Stock changed. Review your bag before paying.';
    end if;
    select coalesce(sum(a.remaining), 0)::integer into held_current_event
      from public.inventory_allocations a where a.menu_item_id = new.menu_item_id;
    select quantity into previous_qty from public.inventory_order_stock
      where order_id = new.order_id and menu_item_id = new.menu_item_id for update;
    previous_qty := coalesce(previous_qty, 0);
    target_qty := previous_qty + new.quantity;
    select coalesce(sum(s.quantity), 0)::integer into global_held
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = new.menu_item_id and s.event_id is null and s.state = 'held'
        and s.order_id <> new.order_id and (s.expires_at is null or s.expires_at > now())
        and o.status <> 'cancelled';
    if item.on_hand - held_current_event - global_held < target_qty then
      raise exception 'Stock changed. Review your bag before paying.';
    end if;
    insert into public.inventory_order_stock(order_id, menu_item_id, event_id, quantity, state, expires_at)
      values(new.order_id, new.menu_item_id, null, target_qty, 'held', order_record.reservation_expires_at)
      on conflict (order_id, menu_item_id) do update
        set quantity = excluded.quantity, expires_at = excluded.expires_at
        where public.inventory_order_stock.state = 'held';
    update public.inventory_items set version = version + 1 where menu_item_id = new.menu_item_id;
    if previous_qty = 0 then
      insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
        values(new.menu_item_id, null, new.order_id, 'hold', 0, 'Checkout stock hold');
    end if;
    return new;
  end if;
  select * into allocation from public.inventory_allocations
    where menu_item_id = new.menu_item_id and event_id = order_record.event_id for update;
$after$;
begin
  select pg_get_functiondef('private.inventory_capture_order_item()'::regprocedure) into definition;
  if position(before_block in definition) = 0 then
    raise exception 'Unexpected inventory capture implementation; apply migrations through 066 before 067';
  end if;
  execute replace(definition, before_block, after_block);
end;
$$;

do $$
declare
  definition text;
  before_block text := $before$
  if item.tracking_mode = 'none' then return; end if;
  is_cash_sale := order_record.payment_method = 'cash' and order_record.status <> 'cancelled';
  select * into allocation from public.inventory_allocations
    where menu_item_id = item_uuid and event_id = order_record.event_id for update;
$before$;
  after_block text := $after$
  if item.tracking_mode = 'none' then return; end if;
  is_cash_sale := order_record.payment_method = 'cash' and order_record.status <> 'cancelled';
  if order_record.event_id is null then
    if item.tracking_mode <> 'global' or is_cash_sale then
      raise exception 'Stock changed. Review your bag before paying.';
    end if;
    select coalesce(sum(a.remaining), 0)::integer into held_current_event
      from public.inventory_allocations a where a.menu_item_id = item_uuid;
    select quantity into previous_qty from public.inventory_order_stock
      where order_id = order_uuid and menu_item_id = item_uuid for update;
    previous_qty := coalesce(previous_qty, 0);
    target_qty := previous_qty + consumed_quantity;
    select coalesce(sum(s.quantity), 0)::integer into global_held
      from public.inventory_order_stock s join public.orders o on o.id = s.order_id
      where s.menu_item_id = item_uuid and s.event_id is null and s.state = 'held'
        and s.order_id <> order_uuid and (s.expires_at is null or s.expires_at > now())
        and o.status <> 'cancelled';
    if item.on_hand - held_current_event - global_held < target_qty then
      raise exception 'Stock changed. Review your bag before paying.';
    end if;
    insert into public.inventory_order_stock(order_id, menu_item_id, event_id, quantity, state, expires_at)
      values(order_uuid, item_uuid, null, target_qty, 'held', order_record.reservation_expires_at)
      on conflict (order_id, menu_item_id) do update
        set quantity = excluded.quantity, expires_at = excluded.expires_at
        where public.inventory_order_stock.state = 'held';
    update public.inventory_items set version = version + 1 where menu_item_id = item_uuid;
    if previous_qty = 0 then
      insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
        values(item_uuid, null, order_uuid, 'hold', 0, 'Checkout stock hold');
    end if;
    return;
  end if;
  select * into allocation from public.inventory_allocations
    where menu_item_id = item_uuid and event_id = order_record.event_id for update;
$after$;
begin
  if to_regprocedure('private.inventory_consume(uuid,uuid,integer)') is not null then
    select pg_get_functiondef('private.inventory_consume(uuid,uuid,integer)'::regprocedure) into definition;
    if position(before_block in definition) = 0 then
      raise exception 'Unexpected linked inventory implementation; apply migrations through 066 before 067';
    end if;
    execute replace(definition, before_block, after_block);
  end if;
end;
$$;

create or replace function private.inventory_finalize_order(order_uuid uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  stock record;
  item public.inventory_items%rowtype;
  allocation public.inventory_allocations%rowtype;
  held_elsewhere integer;
  global_held integer;
begin
  perform private.inventory_lock();
  for stock in select * from public.inventory_order_stock where order_id = order_uuid and state = 'held'
    order by menu_item_id for update
  loop
    select * into item from public.inventory_items where menu_item_id = stock.menu_item_id for update;
    if not found then return false; end if;
    if stock.event_id is null then
      if item.tracking_mode <> 'global' then return false; end if;
      select coalesce(sum(a.remaining), 0)::integer into held_elsewhere
        from public.inventory_allocations a where a.menu_item_id = stock.menu_item_id;
      select coalesce(sum(s.quantity), 0)::integer into global_held
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = stock.menu_item_id and s.event_id is null and s.state = 'held'
          and s.order_id <> order_uuid and (s.expires_at is null or s.expires_at > now())
          and o.status <> 'cancelled';
      if item.on_hand - held_elsewhere - global_held < stock.quantity then return false; end if;
    else
      select coalesce(sum(s.quantity), 0)::integer into global_held
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = stock.menu_item_id and s.state = 'held'
          and s.order_id <> order_uuid and (s.expires_at is null or s.expires_at > now())
          and o.status <> 'cancelled';
      select * into allocation from public.inventory_allocations
        where menu_item_id = stock.menu_item_id and event_id = stock.event_id for update;
      if not found then return false; end if;
      select coalesce(sum(s.quantity), 0)::integer into held_elsewhere
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = stock.menu_item_id and s.event_id = stock.event_id
          and s.state = 'held' and s.order_id <> order_uuid
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
      if (item.tracking_mode = 'global' and item.on_hand - global_held < stock.quantity)
        or allocation.remaining - held_elsewhere < stock.quantity then return false; end if;
    end if;
  end loop;
  for stock in select * from public.inventory_order_stock where order_id = order_uuid and state = 'held'
    order by menu_item_id for update
  loop
    update public.inventory_items set on_hand = on_hand - stock.quantity, version = version + 1
      where menu_item_id = stock.menu_item_id and tracking_mode = 'global';
    if stock.event_id is not null then
      update public.inventory_allocations set remaining = remaining - stock.quantity, version = version + 1
        where menu_item_id = stock.menu_item_id and event_id = stock.event_id;
    end if;
    update public.inventory_order_stock set state = 'sold' where order_id = order_uuid and menu_item_id = stock.menu_item_id;
    insert into public.inventory_movements(menu_item_id, event_id, order_id, action, quantity, reason)
      values(stock.menu_item_id, stock.event_id, order_uuid, 'sale', -stock.quantity, 'Paid order');
  end loop;
  return true;
end;
$$;
revoke all on function private.inventory_finalize_order(uuid) from public, anon, authenticated, service_role;

do $$
declare
  definition text;
  before_block text := $before$
    update public.inventory_allocations set remaining = remaining + stock.quantity, version = version + 1
      where menu_item_id = stock.menu_item_id and event_id = stock.event_id;
    if not found then raise exception 'Cannot restore stock: event allocation no longer exists'; end if;
$before$;
  after_block text := $after$
    if stock.event_id is not null then
      update public.inventory_allocations set remaining = remaining + stock.quantity, version = version + 1
        where menu_item_id = stock.menu_item_id and event_id = stock.event_id;
      if not found then raise exception 'Cannot restore stock: event allocation no longer exists'; end if;
    end if;
$after$;
begin
  select pg_get_functiondef('public.admin_restock_order(uuid,text)'::regprocedure) into definition;
  if position(before_block in definition) = 0 then
    raise exception 'Unexpected restock implementation; apply migrations through 066 before 067';
  end if;
  execute replace(definition, before_block, after_block);
end;
$$;

do $$
declare
  definition text;
  before_allocate text := $before$
    if item.tracking_mode = 'global' and allocated - old_remaining + quantity > item.on_hand then
      raise exception 'Allocations cannot exceed stock on hand';
    end if;
$before$;
  after_allocate text := $after$
    if item.tracking_mode = 'global' then
      select coalesce(sum(s.quantity), 0)::integer into held_global
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = item_uuid and s.event_id is null and s.state = 'held'
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
    end if;
    if item.tracking_mode = 'global' and allocated - old_remaining + quantity + held_global > item.on_hand then
      raise exception 'Allocations cannot exceed uncommitted stock on hand';
    end if;
$after$;
  before_correct text := $before$
      select coalesce(sum(s.quantity), 0)::integer into held_global
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = item_uuid and s.state = 'held'
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
      if quantity < held_global then raise exception 'Correction would leave active stock holds uncovered'; end if;
$before$;
  after_correct text := $after$
      select coalesce(sum(s.quantity), 0)::integer into held_global
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = item_uuid and s.event_id is null and s.state = 'held'
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
      if quantity < allocated + held_global then
        raise exception 'Correction would leave allocations or online stock holds uncovered';
      end if;
$after$;
  before_waste text := $before$
      if item.on_hand - quantity < allocated then raise exception 'Waste would leave allocations greater than stock on hand'; end if;
$before$;
  after_waste text := $after$
      select coalesce(sum(s.quantity), 0)::integer into held_global
        from public.inventory_order_stock s join public.orders o on o.id = s.order_id
        where s.menu_item_id = item_uuid and s.event_id is null and s.state = 'held'
          and (s.expires_at is null or s.expires_at > now()) and o.status <> 'cancelled';
      if quantity > item.on_hand - allocated - held_global then
        raise exception 'Waste would leave allocations or online stock holds uncovered';
      end if;
$after$;
begin
  select pg_get_functiondef(
    'public.admin_inventory_action(uuid,uuid,text,integer,bigint,text,text,text,uuid)'::regprocedure
  ) into definition;
  if position(before_allocate in definition) = 0 or position(before_correct in definition) = 0
    or position(before_waste in definition) = 0 then
    raise exception 'Unexpected inventory administration implementation; apply migrations through 066 before 067';
  end if;
  definition := replace(definition, before_allocate, after_allocate);
  definition := replace(definition, before_correct, after_correct);
  definition := replace(definition, before_waste, after_waste);
  execute definition;
end;
$$;

create or replace function public.admin_inventory_sales()
returns table(menu_item_id uuid, event_id uuid, sold_quantity bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  return query
    select movement.menu_item_id, movement.event_id, -sum(movement.quantity)::bigint
    from public.inventory_movements movement
    where movement.action in ('sale', 'restore_order')
    group by movement.menu_item_id, movement.event_id;
end;
$$;
revoke all on function public.admin_inventory_sales() from public, anon, service_role;
grant execute on function public.admin_inventory_sales() to authenticated;

notify pgrst, 'reload schema';
commit;
