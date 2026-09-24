begin;

alter table public.orders add column if not exists checkout_payload jsonb;

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
  selected_options uuid[];
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
  if settings.singleton is null or settings.maintenance_enabled or not settings.card_enabled then
    raise exception 'Card checkout is unavailable';
  end if;
  if (select count(*) from public.orders where customer_id = customer_uuid and status = 'pending_payment') >= 3 then
    raise exception 'Complete or cancel an existing checkout first';
  end if;
  if jsonb_typeof(payload->'lines') <> 'array' or jsonb_array_length(payload->'lines') not between 1 and 50 then
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
    if jsonb_typeof(line->'optionIds') <> 'array' then raise exception 'Invalid choices'; end if;
    select coalesce(array_agg(value::uuid), '{}') into selected_options from jsonb_array_elements_text(line->'optionIds');
    if cardinality(selected_options) <> (select count(distinct option_id) from unnest(selected_options) option_id)
      or exists (select 1 from unnest(selected_options) option_id where not exists (
        select 1 from public.modifier_options option_record
        join public.modifier_groups group_record on group_record.id = option_record.modifier_group_id
        join public.menu_item_modifier_groups association on association.modifier_group_id = group_record.id
        where option_record.id = option_id and option_record.is_available and group_record.is_published
          and association.menu_item_id = item_record.id
      )) then raise exception 'A selected choice is no longer available'; end if;
    if exists (
      select 1 from public.menu_item_modifier_groups association
      join public.modifier_groups group_record on group_record.id = association.modifier_group_id
      where association.menu_item_id = item_record.id and group_record.is_published
      and (select count(*) from public.modifier_options where modifier_group_id = group_record.id and id = any(selected_options))
        not between group_record.min_selections and group_record.max_selections
    ) then raise exception 'Review the required choices for your items'; end if;
    select coalesce(sum(price_pence), 0) into extras from public.modifier_options where id = any(selected_options);
    subtotal := subtotal + quantity * (item_record.price_pence + extras);
    snapshots := snapshots || jsonb_build_array(jsonb_build_object(
      'item', to_jsonb(item_record), 'quantity', quantity, 'extras', extras, 'options', to_jsonb(selected_options)));
  end loop;
  if subtotal + settings.service_fee_pence + settings.packaging_fee_pence <> (payload->>'expectedTotal')::integer then
    raise exception 'Prices have changed. Refresh your bag before paying.';
  end if;
  if subtotal + settings.service_fee_pence + settings.packaging_fee_pence < 30 then
    raise exception 'Card orders must total at least GBP 0.30';
  end if;
  select * into slot_record from public.pickup_slots where id = (payload->>'slotId')::uuid for update;
  if not found then raise exception 'Pickup slot unavailable'; end if;
  select pickup_lead_minutes into preparation_minutes from public.events where id = slot_record.event_id;
  payment_deadline := least(now() + interval '1 hour', slot_record.starts_at - make_interval(mins => preparation_minutes));
  if payment_deadline < now() + interval '32 minutes' then raise exception 'Choose a later pickup time for card checkout'; end if;
  if (select count(*) from public.orders where pickup_slot_id = slot_record.id and status <> 'cancelled') >= slot_record.capacity then
    raise exception 'Pickup slot is full';
  end if;
  insert into public.orders(checkout_key, checkout_payload, customer_id, event_id, pickup_slot_id,
    customer_name, customer_email, customer_phone, customer_note, status, payment_method,
    subtotal_pence, service_fee_pence, packaging_fee_pence, reservation_expires_at)
  values(request_key, payload, customer_uuid, slot_record.event_id, slot_record.id,
    payload->>'name', payload->>'email', payload->>'phone', coalesce(payload->>'note', ''), 'pending_payment', 'card',
    subtotal, settings.service_fee_pence, settings.packaging_fee_pence, now() + interval '30 minutes')
  returning * into order_record;
  update public.orders set reservation_expires_at = payment_deadline where id = order_record.id returning * into order_record;
  for saved_line in select value from jsonb_array_elements(snapshots) loop
    select coalesce(array_agg(value::uuid), '{}') into selected_options from jsonb_array_elements_text(saved_line->'options');
    insert into public.order_items(order_id, menu_item_id, item_name, quantity, unit_price_pence, unit_extras_pence, allergen_snapshot)
    values(order_record.id, (saved_line->'item'->>'id')::uuid, saved_line->'item'->>'name',
      (saved_line->>'quantity')::integer, (saved_line->'item'->>'price_pence')::integer, (saved_line->>'extras')::integer,
      array(select distinct allergen from (
        select value as allergen from jsonb_array_elements_text(saved_line->'item'->'allergens')
        union all select unnest(allergens) from public.modifier_options where id = any(selected_options)
      ) combined)) returning id into item_uuid;
    insert into public.order_item_modifiers(order_item_id, modifier_option_id, group_name, option_name, unit_price_pence, allergen_snapshot)
    select item_uuid, option_record.id, group_record.name, option_record.name, option_record.price_pence, option_record.allergens
    from public.modifier_options option_record join public.modifier_groups group_record on group_record.id = option_record.modifier_group_id
    where option_record.id = any(selected_options);
  end loop;
  insert into public.payments(order_id, provider, amount_pence) values(order_record.id, 'stripe', order_record.total_pence);
  return order_record;
end;
$$;
revoke all on function public.reserve_card_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_card_order(uuid, uuid, jsonb) to service_role;

create or replace function public.attach_stripe_checkout(order_uuid uuid, session_id text, expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.orders where id = order_uuid for update;
  update public.payments set stripe_checkout_session_id = session_id
  where order_id = order_uuid and provider = 'stripe'
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = session_id);
  if not found then raise exception 'Checkout session does not match'; end if;
  update public.orders set reservation_expires_at = expires_at where id = order_uuid and status = 'pending_payment';
end;
$$;
revoke all on function public.attach_stripe_checkout(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.attach_stripe_checkout(uuid, text, timestamptz) to service_role;

create or replace function public.process_stripe_checkout(event_id text, event_kind text, order_uuid uuid,
  session_id text, intent_id text, amount integer, payment_currency text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare order_record public.orders%rowtype; payment_record public.payments%rowtype;
begin
  select * into order_record from public.orders where id = order_uuid for update;
  if not found then raise exception 'Order not found'; end if;
  select * into payment_record from public.payments where order_id = order_uuid and provider = 'stripe' for update;
  if not found or (payment_record.stripe_checkout_session_id is not null and payment_record.stripe_checkout_session_id <> session_id)
    or amount <> order_record.total_pence or payment_currency <> order_record.currency then
    raise exception 'Payment does not match order';
  end if;
  if event_kind not in ('checkout.session.completed', 'checkout.session.expired') then raise exception 'Unsupported payment event'; end if;
  insert into public.stripe_webhook_events(stripe_event_id, event_type) values(event_id, event_kind) on conflict do nothing;
  if not found then return order_record.status = 'cancelled' and order_record.payment_status = 'paid'; end if;
  if event_kind = 'checkout.session.completed' then
    if intent_id is null then raise exception 'Missing payment intent'; end if;
    if payment_record.status in ('pending', 'failed') then
      update public.payments set status = 'succeeded', paid_at = now(), stripe_checkout_session_id = session_id,
        stripe_payment_intent_id = intent_id where id = payment_record.id;
      update public.orders set payment_status = 'paid', status = case when status = 'pending_payment' then 'ordered' else status end
        where id = order_uuid;
    end if;
    return order_record.status = 'cancelled' and order_record.payment_status not in ('refunded', 'partially_refunded');
  else
    if order_record.status = 'pending_payment' and payment_record.status = 'pending' then
      update public.orders set status = 'cancelled', payment_status = 'failed', cancellation_reason = 'Payment session expired.' where id = order_uuid;
      update public.payments set status = 'failed', stripe_checkout_session_id = session_id where id = payment_record.id;
    end if;
    return false;
  end if;
end;
$$;
revoke all on function public.process_stripe_checkout(text, text, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.process_stripe_checkout(text, text, uuid, text, text, integer, text) to service_role;

create or replace function public.process_stripe_refund(event_id text, intent_id text, refunded integer)
returns void language plpgsql security definer set search_path = '' as $$
declare payment_record public.payments%rowtype;
begin
  select * into payment_record from public.payments where stripe_payment_intent_id = intent_id;
  if not found then raise exception 'Payment not recorded yet'; end if;
  perform 1 from public.orders where id = payment_record.order_id for update;
  select * into payment_record from public.payments where id = payment_record.id for update;
  if refunded < 0 or refunded > payment_record.amount_pence then raise exception 'Invalid refund amount'; end if;
  insert into public.stripe_webhook_events(stripe_event_id, event_type) values(event_id, 'charge.refunded') on conflict do nothing;
  if not found or refunded <= payment_record.refunded_pence then return; end if;
  update public.payments set refunded_pence = refunded,
    status = case when refunded = amount_pence then 'refunded' else 'partially_refunded' end where id = payment_record.id;
  update public.orders set payment_status = case when refunded = payment_record.amount_pence then 'refunded' else 'partially_refunded' end
    where id = payment_record.order_id;
end;
$$;
revoke all on function public.process_stripe_refund(text, text, integer) from public, anon, authenticated;
grant execute on function public.process_stripe_refund(text, text, integer) to service_role;

create or replace function public.cancel_card_checkout(order_uuid uuid, customer_uuid uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare order_record public.orders%rowtype; session_id text;
begin
  select * into order_record from public.orders where id = order_uuid and customer_id = customer_uuid for update;
  if not found or order_record.status <> 'pending_payment' then raise exception 'Checkout cannot be cancelled'; end if;
  update public.orders set status = 'cancelled', cancellation_reason = 'Checkout cancelled by customer.' where id = order_uuid;
  select stripe_checkout_session_id into session_id from public.payments where order_id = order_uuid and provider = 'stripe';
  return session_id;
end;
$$;
revoke all on function public.cancel_card_checkout(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_card_checkout(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;