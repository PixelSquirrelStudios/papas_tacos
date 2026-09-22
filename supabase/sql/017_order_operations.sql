begin;

create function public.admin_set_order_status(order_uuid uuid, next_status text, reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into order_record from public.orders where id = order_uuid for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if next_status = order_record.status then
    return order_record;
  end if;
  if next_status is null or not (
    (order_record.status = 'ordered' and next_status = 'preparing')
    or (order_record.status = 'preparing' and next_status = 'ready_for_pickup')
    or (order_record.status = 'ready_for_pickup' and next_status = 'collected')
    or (order_record.status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup') and next_status = 'cancelled')
  ) then
    raise exception 'Invalid order status transition';
  end if;
  if next_status = 'collected' and order_record.payment_status not in ('paid', 'partially_refunded', 'refunded') then
    raise exception 'Record payment before marking an order collected';
  end if;
  if next_status = 'cancelled' and nullif(trim(reason), '') is null then
    raise exception 'A cancellation reason is required';
  end if;
  update public.orders set status = next_status,
    cancellation_reason = case when next_status = 'cancelled' then reason else cancellation_reason end
  where id = order_uuid returning * into order_record;
  return order_record;
end;
$$;

revoke all on function public.admin_set_order_status(uuid, text, text) from public;
grant execute on function public.admin_set_order_status(uuid, text, text) to authenticated;

create function public.admin_mark_cash_paid(order_uuid uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
begin
  if not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into order_record from public.orders where id = order_uuid for update;
  if not found then
    raise exception 'Order not found';
  end if;
  if order_record.payment_method <> 'cash' or order_record.status = 'cancelled' then
    raise exception 'Order is not eligible for cash collection';
  end if;
  if order_record.payment_status = 'paid' then
    return order_record;
  end if;
  if order_record.payment_status <> 'unpaid' then
    raise exception 'Order payment status is not unpaid';
  end if;
  insert into public.payments (order_id, provider, status, amount_pence, collected_by, paid_at)
  values (order_uuid, 'cash', 'succeeded', order_record.total_pence, auth.uid(), now());
  update public.orders set payment_status = 'paid'
  where id = order_uuid returning * into order_record;
  return order_record;
end;
$$;

revoke all on function public.admin_mark_cash_paid(uuid) from public;
grant execute on function public.admin_mark_cash_paid(uuid) to authenticated;

create function private.protect_booked_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.event_id, new.starts_at, new.ends_at) is distinct from (old.event_id, old.starts_at, old.ends_at)
    and exists (select 1 from public.orders where pickup_slot_id = old.id) then
    raise exception 'Booked pickup slots cannot be moved; disable the slot instead';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_booked_slot() from public;
create trigger pickup_slots_protect_bookings before update on public.pickup_slots
for each row execute function private.protect_booked_slot();

create function private.protect_event_hours()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at)
    and exists (
      select 1 from public.pickup_slots
      where event_id = old.id and (starts_at < new.starts_at or ends_at > new.ends_at)
    ) then
    raise exception 'Event hours must contain all existing pickup slots';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_event_hours() from public;
create trigger events_protect_hours before update on public.events
for each row execute function private.protect_event_hours();

commit;