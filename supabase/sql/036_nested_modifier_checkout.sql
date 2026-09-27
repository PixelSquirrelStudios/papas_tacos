begin;

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
  select coalesce(jsonb_agg(jsonb_build_object(
    'selection_key', case when groups.depth = 0 then options.id::text else groups.group_key || ':' || options.id::text end,
    'option_id', options.id, 'group_key', groups.group_key, 'group_name', groups.group_name,
    'option_name', options.name, 'price_pence', options.price_pence, 'allergens', options.allergens
  ) order by groups.group_key, options.sort_order, options.id), '[]') into choices
  from private.item_modifier_groups(item_uuid) groups
  join public.modifier_options options on options.modifier_group_id = groups.group_id
  where options.is_available and (case when groups.depth = 0 then options.id::text else groups.group_key || ':' || options.id::text end) = any(selected);
  if jsonb_array_length(choices) <> cardinality(selected) then raise exception 'A selected choice is no longer available'; end if;
  if exists (
    select 1 from private.item_modifier_groups(item_uuid) groups
    where (select count(*) from jsonb_array_elements(choices) choice where choice->>'group_key' = groups.group_key)
      not between groups.min_selections and groups.max_selections
  ) then raise exception 'Review the required choices for your items'; end if;
  return choices;
end;
$$;
revoke all on function private.quote_modifier_choices(uuid, jsonb) from public, anon, authenticated;
grant execute on function private.quote_modifier_choices(uuid, jsonb) to service_role;

create or replace function public.reserve_card_order(customer_uuid uuid, request_key uuid, payload jsonb)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  settings public.business_settings%rowtype;
  order_record public.orders%rowtype;
  item_record public.menu_items%rowtype;
  slot_record public.pickup_slots%rowtype;
  line jsonb;
  saved_line jsonb;
  snapshots jsonb := '[]';
  choices jsonb;
  extras integer;
  subtotal integer := 0;
  quantity integer;
  item_uuid uuid;
  preparation_minutes integer;
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
  if settings.singleton is null or settings.maintenance_enabled or not settings.card_enabled then raise exception 'Card checkout is unavailable'; end if;
  if (select count(*) from public.orders where customer_id = customer_uuid and status = 'pending_payment') >= 3 then raise exception 'Complete or cancel an existing checkout first'; end if;
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
  select * into slot_record from public.pickup_slots where id = (payload->>'slotId')::uuid for update;
  if not found then raise exception 'Pickup slot unavailable'; end if;
  select pickup_lead_minutes into preparation_minutes from public.events where id = slot_record.event_id;
  payment_deadline := least(now() + interval '1 hour', slot_record.starts_at - make_interval(mins => preparation_minutes));
  if payment_deadline < now() + interval '32 minutes' then raise exception 'Choose a later pickup time for card checkout'; end if;
  if (select count(*) from public.orders where pickup_slot_id = slot_record.id and status <> 'cancelled') >= slot_record.capacity then raise exception 'Pickup slot is full'; end if;
  insert into public.orders(checkout_key, checkout_payload, customer_id, event_id, pickup_slot_id,
    customer_name, customer_email, customer_phone, customer_note, status, payment_method,
    subtotal_pence, service_fee_pence, packaging_fee_pence, reservation_expires_at)
  values(request_key, payload, customer_uuid, slot_record.event_id, slot_record.id,
    payload->>'name', payload->>'email', payload->>'phone', coalesce(payload->>'note', ''), 'pending_payment', 'card',
    subtotal, settings.service_fee_pence, settings.packaging_fee_pence, now() + interval '30 minutes') returning * into order_record;
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
revoke all on function public.reserve_card_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_card_order(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;