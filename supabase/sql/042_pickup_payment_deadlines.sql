begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('if payment_deadline < now() + interval ''32 minutes''' in definition) > 0 then
    definition := replace(definition,
      'if payment_deadline < now() + interval ''32 minutes'' then raise exception ''Choose a later pickup time for card checkout''; end if;',
      'if payment_deadline <= now() then raise exception ''Pickup slot outside trading hours or preparation lead time''; end if;');
    execute definition;
  end if;
  if position('32 minutes' in definition) > 0 or position('if payment_deadline <= now()' in definition) = 0 then
    raise exception 'Unexpected reserve_card_order definition; apply migrations through 041 first';
  end if;

  select pg_get_functiondef('public.get_pickup_choices(uuid)'::regprocedure) into definition;
  definition := replace(definition, 'events.pickup_lead_minutes + 32', 'events.pickup_lead_minutes');
  if position('make_interval(mins => events.pickup_lead_minutes)' in definition) = 0 then
    raise exception 'Unexpected get_pickup_choices definition; apply migration 040 first';
  end if;
  execute definition;
end;
$$;

create or replace function public.attach_stripe_checkout(order_uuid uuid, session_id text, expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if expires_at is null or session_id is null then raise exception 'Invalid checkout session'; end if;
  perform 1 from public.orders where id = order_uuid for update;
  update public.payments set stripe_checkout_session_id = session_id
  where order_id = order_uuid and provider = 'stripe'
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = session_id);
  if not found then raise exception 'Checkout session does not match'; end if;
  update public.orders set reservation_expires_at = least(reservation_expires_at, expires_at)
    where id = order_uuid and status = 'pending_payment';
end;
$$;
revoke all on function public.attach_stripe_checkout(uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.attach_stripe_checkout(uuid,text,timestamptz) to service_role;

drop function if exists public.process_stripe_checkout(text,text,uuid,text,text,integer,text);
create or replace function public.process_stripe_checkout(event_id text, event_kind text, order_uuid uuid,
  session_id text, intent_id text, amount integer, payment_currency text, occurred_at timestamptz default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  order_record public.orders%rowtype;
  payment_record public.payments%rowtype;
  payment_time timestamptz := coalesce(occurred_at, now());
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
  if not found then return order_record.status = 'cancelled' and order_record.payment_status in ('paid', 'partially_refunded'); end if;
  if event_kind = 'checkout.session.completed' then
    if intent_id is null then raise exception 'Missing payment intent'; end if;
    if payment_record.status in ('pending', 'failed') then
      if order_record.status = 'pending_payment' and payment_time >= order_record.reservation_expires_at then
        update public.orders set status = 'cancelled', cancellation_reason = 'Payment completed after the pickup payment deadline. A refund has been requested.'
          where id = order_uuid;
        order_record.status := 'cancelled';
      end if;
      update public.payments set status = 'succeeded', paid_at = payment_time, stripe_checkout_session_id = session_id,
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
revoke all on function public.process_stripe_checkout(text,text,uuid,text,text,integer,text,timestamptz) from public, anon, authenticated;
grant execute on function public.process_stripe_checkout(text,text,uuid,text,text,integer,text,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;