begin;

alter table public.events add column if not exists service_mode text not null default 'pickup'
  check (service_mode in ('pickup', 'table', 'car'));
alter table public.orders alter column pickup_slot_id drop not null;

create or replace function private.event_ordering_reason(settings public.business_settings, event_record public.events)
returns text language sql stable set search_path = '' as $$
  select case
    when settings.singleton is null or settings.ordering_status = 'closed' then 'business_closed'
    when settings.ordering_status = 'paused' then 'business_paused'
    when event_record.id is null or not event_record.is_published then 'event_unavailable'
    when not event_record.pickup_enabled then 'pickup_disabled'
    when event_record.ordering_status = 'closed' then 'event_closed'
    when event_record.ordering_status = 'paused' then 'event_paused'
    when event_record.starts_at is null or event_record.ends_at is null then 'event_unavailable'
    when now() < case when event_record.service_mode = 'pickup' then event_record.orders_open_at
      else coalesce(event_record.orders_open_at, event_record.starts_at) end then 'not_open_yet'
    when now() >= least(event_record.ends_at, coalesce(event_record.orders_close_at, event_record.ends_at)) then 'ordering_ended'
    else 'open'
  end;
$$;

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
    new.pickup_starts_at := event_record.starts_at;
    new.pickup_ends_at := event_record.ends_at;
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
  new.pickup_location := jsonb_build_object(
    'event_title', event_record.title, 'venue_name', event_record.venue_name,
    'address_line_1', event_record.address_line_1, 'address_line_2', event_record.address_line_2,
    'town', event_record.town, 'postcode', event_record.postcode, 'service_mode', event_record.service_mode,
    'location_number', case when event_record.service_mode <> 'pickup' then location_number else '' end,
    'number_plate', case when event_record.service_mode = 'car' then number_plate else '' end
  );
  return new;
end;
$$;

create or replace function public.reserve_card_order(customer_uuid uuid, request_key uuid, payload jsonb)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  settings public.business_settings%rowtype;
  order_record public.orders%rowtype;
  item_record public.menu_items%rowtype;
  slot_record public.pickup_slots%rowtype;
  event_record public.events%rowtype;
  line jsonb;
  saved_line jsonb;
  snapshots jsonb := '[]';
  choices jsonb;
  extras integer;
  subtotal integer := 0;
  quantity integer;
  item_uuid uuid;
  payment_deadline timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(customer_uuid::text, 0));
  select * into order_record from public.orders where checkout_key = request_key;
  if found then
    if order_record.customer_id <> customer_uuid or order_record.checkout_payload is distinct from payload then
      raise exception 'Checkout request changed. Start a new checkout.';
    end if;
    return order_record;
  end if;
  select * into settings from public.business_settings where singleton for share;
  if settings.singleton is null or not settings.card_enabled or (settings.maintenance_enabled and not exists (select 1 from public.profiles where id = customer_uuid and role = 'admin')) then raise exception 'Card checkout is unavailable'; end if;
  if (select count(*) from public.orders where customer_id = customer_uuid and status = 'pending_payment') >= 3 then
    raise exception 'Complete or cancel an existing checkout first';
  end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 50 then
    raise exception 'Your bag must contain between 1 and 50 items';
  end if;
  lock table public.menu_categories, public.menu_items, public.modifier_groups,
    public.modifier_options, public.menu_item_modifier_groups in share mode;
  for line in select value from jsonb_array_elements(payload->'lines') loop
    quantity := (line->>'quantity')::integer;
    if quantity is null or quantity not between 1 and 99 then raise exception 'Invalid item quantity'; end if;
    select * into item_record from public.menu_items where id = (line->>'itemId')::uuid
      and is_published and is_available and archived_at is null
      and exists (select 1 from public.menu_categories where id = category_id and is_published);
    if not found then raise exception 'A menu item is no longer available'; end if;
    choices := private.quote_modifier_choices(item_record.id, line->'optionIds');
    select coalesce(sum((choice->>'price_pence')::integer), 0) into extras from jsonb_array_elements(choices) choice;
    subtotal := subtotal + quantity * (item_record.price_pence + extras);
    snapshots := snapshots || jsonb_build_array(jsonb_build_object(
      'item', to_jsonb(item_record), 'quantity', quantity, 'extras', extras, 'choices', choices));
  end loop;
  if (payload->>'expectedTotal')::integer is distinct from subtotal + settings.service_fee_pence + settings.packaging_fee_pence then
    raise exception 'Prices have changed. Refresh your bag before paying.';
  end if;
  if subtotal + settings.service_fee_pence + settings.packaging_fee_pence < 30 then raise exception 'Card orders must total at least GBP 0.30'; end if;
  if nullif(payload->>'slotId', '') is not null then
    select * into slot_record from public.pickup_slots where id = (payload->>'slotId')::uuid for update;
    if not found then raise exception 'Pickup slot unavailable'; end if;
    select * into event_record from public.events where id = slot_record.event_id for share;
    if event_record.service_mode <> 'pickup' or (nullif(payload->>'eventId', '') is not null
      and (payload->>'eventId')::uuid <> event_record.id) then raise exception 'The selected event does not match this order'; end if;
    payment_deadline := least(now() + interval '1 hour', slot_record.starts_at - make_interval(mins => event_record.pickup_lead_minutes));
    if payment_deadline <= now() then raise exception 'Pickup slot outside trading hours or preparation lead time'; end if;
    if (select count(*) from public.orders where pickup_slot_id = slot_record.id and status <> 'cancelled') >= slot_record.capacity then
      raise exception 'Pickup slot is full';
    end if;
  else
    select * into event_record from public.events where id = (payload->>'eventId')::uuid for share;
    if not found or event_record.service_mode = 'pickup' then raise exception 'Choose an event and an available pickup time if required'; end if;
    -- A checkout started while open gets at most five minutes beyond ordering close,
    -- never beyond the end of service.
    payment_deadline := least(now() + interval '10 minutes', event_record.ends_at,
      coalesce(event_record.orders_close_at, event_record.ends_at) + interval '5 minutes');
    if payment_deadline <= now() then raise exception 'Ordering unavailable: ordering_ended'; end if;
  end if;
  insert into public.orders(checkout_key, checkout_payload, customer_id, event_id, pickup_slot_id,
    customer_name, customer_email, customer_phone, customer_note, status, payment_method,
    subtotal_pence, service_fee_pence, packaging_fee_pence, reservation_expires_at)
  values(request_key, payload, customer_uuid, event_record.id, slot_record.id,
    payload->>'name', payload->>'email', payload->>'phone', coalesce(payload->>'note', ''), 'pending_payment', 'card',
    subtotal, settings.service_fee_pence, settings.packaging_fee_pence, least(payment_deadline, now() + interval '30 minutes'))
    returning * into order_record;
  update public.orders set reservation_expires_at = payment_deadline where id = order_record.id returning * into order_record;
  for saved_line in select value from jsonb_array_elements(snapshots) loop
    insert into public.order_items(order_id, menu_item_id, item_name, quantity, unit_price_pence, unit_extras_pence, allergen_snapshot)
    values(order_record.id, (saved_line->'item'->>'id')::uuid, saved_line->'item'->>'name',
      (saved_line->>'quantity')::integer, (saved_line->'item'->>'price_pence')::integer, (saved_line->>'extras')::integer,
      array(select distinct allergen from (
        select value as allergen from jsonb_array_elements_text(saved_line->'item'->'allergens')
        union all select allergen from jsonb_array_elements(saved_line->'choices') choice cross join lateral jsonb_array_elements_text(choice->'allergens') allergen
      ) combined)) returning id into item_uuid;
    insert into public.order_item_modifiers(order_item_id, modifier_option_id, selection_key, group_name, option_name, unit_price_pence, allergen_snapshot)
    select item_uuid, (choice->>'option_id')::uuid, choice->>'selection_key', choice->>'group_name', choice->>'option_name',
      (choice->>'price_pence')::integer, array(select value from jsonb_array_elements_text(choice->'allergens'))
    from jsonb_array_elements(saved_line->'choices') choice;
  end loop;
  insert into public.payments(order_id, provider, amount_pence) values(order_record.id, 'stripe', order_record.total_pence);
  return order_record;
end;
$$;
revoke all on function public.reserve_card_order(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.reserve_card_order(uuid,uuid,jsonb) to service_role;

create or replace function public.admin_set_order_status(order_uuid uuid, next_status text, reason text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare order_record public.orders%rowtype; service boolean;
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  select * into order_record from public.orders where id = order_uuid for update;
  if not found then raise exception 'Order not found'; end if;
  if next_status = order_record.status then return order_record; end if;
  service := coalesce(order_record.pickup_location->>'service_mode', 'pickup') <> 'pickup';
  if next_status is null or not (
    (not service and order_record.status = 'ordered' and next_status = 'preparing')
    or (not service and order_record.status = 'preparing' and next_status = 'ready_for_pickup')
    or (not service and order_record.status = 'ready_for_pickup' and next_status = 'collected')
    or (service and order_record.status = 'ordered' and next_status = 'collected')
    or (service and order_record.status = 'collected' and next_status = 'ordered')
    or (order_record.status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup') and next_status = 'cancelled')
  ) then raise exception 'Invalid order status transition'; end if;
  if next_status = 'collected' and order_record.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    raise exception 'Record payment before marking an order collected';
  end if;
  if next_status = 'cancelled' and nullif(trim(reason), '') is null then raise exception 'A cancellation reason is required'; end if;
  update public.orders set status = next_status,
    cancellation_reason = case when next_status = 'cancelled' then reason else cancellation_reason end
    where id = order_uuid returning * into order_record;
  return order_record;
end;
$$;

create or replace function private.protect_event_service_mode()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.service_mode <> old.service_mode and (exists (select 1 from public.orders where event_id = old.id)
    or exists (select 1 from public.pickup_schedules where event_id = old.id)) then
    raise exception 'Service type cannot change after orders or a pickup schedule exist. Create a new event instead';
  end if;
  return new;
end;
$$;
drop trigger if exists events_protect_service_mode on public.events;
create trigger events_protect_service_mode before update on public.events
  for each row execute function private.protect_event_service_mode();
revoke all on function private.protect_event_service_mode() from public, anon, authenticated;

create or replace function private.require_pickup_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.events where id = new.event_id and service_mode = 'pickup' for share;
  if not found then raise exception 'Pickup schedules and slots require a pickup event'; end if;
  return new;
end;
$$;
revoke all on function private.require_pickup_event() from public, anon, authenticated;
drop trigger if exists a_pickup_schedule_event on public.pickup_schedules;
create trigger a_pickup_schedule_event before insert or update on public.pickup_schedules
  for each row execute function private.require_pickup_event();
drop trigger if exists a_pickup_slot_event on public.pickup_slots;
create trigger a_pickup_slot_event before insert or update on public.pickup_slots
  for each row execute function private.require_pickup_event();

create or replace function public.get_checkout_pickup_choices()
returns table (id uuid, event_id uuid, starts_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, event_title text, venue_name text, status text)
language sql stable security definer set search_path = '' as $$
  select choices.* from public.get_pickup_choices() choices
  join public.events events on events.id = choices.event_id
  where events.service_mode = 'pickup' and events.is_published and events.pickup_enabled and events.ordering_status = 'open'
    and now() >= coalesce(events.orders_open_at, events.starts_at)
    and now() < least(events.ends_at, coalesce(events.orders_close_at, events.ends_at))
    and exists (select 1 from public.business_settings where singleton and ordering_status = 'open'
      and card_enabled and (not maintenance_enabled or private.is_admin()));
$$;

-- Use a neutral deadline description for both service types.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.process_stripe_checkout(text,text,uuid,text,text,integer,text,timestamptz)'::regprocedure) into definition;
  execute replace(definition, 'after the pickup payment deadline', 'after the payment deadline');
end;
$$;

create or replace function public.admin_order_counts(event_uuids uuid[] default '{}', search_text text default '')
returns table (outstanding bigint, complete bigint, cancelled bigint, pending_payment bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  return query select
    count(*) filter (where orders.status in ('ordered','preparing','ready_for_pickup') and orders.payment_status in ('paid','partially_refunded','refunded')),
    count(*) filter (where orders.status = 'collected'),
    count(*) filter (where orders.status = 'cancelled'),
    count(*) filter (where orders.status = 'pending_payment')
  from public.orders
  where (coalesce(cardinality(event_uuids), 0) = 0 or orders.event_id = any(event_uuids))
    and (coalesce(search_text, '') = '' or orders.order_number::text = search_text
      or orders.customer_name ilike '%' || search_text || '%'
      or orders.pickup_location->>'location_number' ilike '%' || search_text || '%'
      or orders.pickup_location->>'number_plate' ilike '%' || search_text || '%');
end;
$$;
revoke all on function public.admin_order_counts(uuid[],text) from public, anon;
grant execute on function public.admin_order_counts(uuid[],text) to authenticated;

notify pgrst, 'reload schema';
commit;
