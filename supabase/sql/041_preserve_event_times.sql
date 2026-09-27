begin;

create or replace function private.generate_pickup_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  step interval;
  times timestamptz[];
  selected_event public.events;
begin
  lock table public.pickup_slots in exclusive mode;
  select * into selected_event from public.events
    where id = new.event_id and pickup_enabled and ordering_status = 'open' for update;
  if not found then raise exception 'Choose an event with pickup enabled and ordering open'; end if;
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then raise exception 'A schedule cannot be moved to another event'; end if;
  if new.preparation_minutes not between 1 and 1440 or new.ends_at <= new.starts_at
    or new.ends_at > new.starts_at + interval '7 days' then raise exception 'Invalid pickup schedule'; end if;
  if selected_event.starts_at is null or selected_event.ends_at is null then
    raise exception 'Set the event start and end times before configuring pickup';
  end if;
  if new.starts_at < selected_event.starts_at or new.ends_at > selected_event.ends_at then
    raise exception 'Pickup times must be within the event start and end times';
  end if;
  step := make_interval(mins => new.preparation_minutes);
  select array_agg(value) into times from generate_series(new.starts_at, new.ends_at - step, step) value;
  if coalesce(cardinality(times), 0) not between 1 and 5000 then raise exception 'The window must fit at least one full preparation interval (maximum 5000 slots)'; end if;
  if exists (
    select 1 from public.pickup_slots slots where slots.event_id = new.event_id
    and exists (select 1 from public.orders where pickup_slot_id = slots.id)
    and (not slots.starts_at = any(times) or slots.ends_at <> slots.starts_at + step
      or (select count(*) from public.orders where pickup_slot_id = slots.id and status <> 'cancelled') > 1)
  ) then raise exception 'This change would move a booked pickup time. Keep its start and duration unchanged'; end if;
  delete from public.pickup_slots slots where slots.event_id = new.event_id
    and not exists (select 1 from public.orders where pickup_slot_id = slots.id)
    and (not slots.starts_at = any(times) or slots.ends_at <> slots.starts_at + step);
  update public.events set orders_open_at = least(now(), new.starts_at), orders_close_at = new.ends_at,
    pickup_lead_minutes = new.preparation_minutes where id = new.event_id;
  insert into public.pickup_slots(event_id, starts_at, ends_at, capacity)
    select new.event_id, value, value + step, 1 from unnest(times) value
    on conflict (event_id, starts_at) do update set capacity = 1 where public.pickup_slots.capacity <> 1;
  return new;
end;
$$;
revoke all on function private.generate_pickup_schedule() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;