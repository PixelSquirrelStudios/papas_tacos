begin;
create or replace function public.get_pickup_choices(event_uuid uuid default null)
returns table (id uuid, event_id uuid, starts_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, event_title text, venue_name text, status text)
language sql stable security definer set search_path = '' as $$
  select slots.id, slots.event_id, slots.starts_at, slots.ends_at, slots.updated_at,
    events.title, events.venue_name,
    case when (select count(*) from public.orders where pickup_slot_id = slots.id and status <> 'cancelled') >= slots.capacity then 'taken'
      when not slots.is_enabled then 'locked'
      when slots.starts_at <= now() + make_interval(mins => events.pickup_lead_minutes + 32) then 'unavailable'
      when events.ordering_status <> 'open' or not events.pickup_enabled or not events.is_published then 'unavailable'
      else 'available' end
  from public.pickup_slots slots join public.events events on events.id = slots.event_id
  where (event_uuid is null or slots.event_id = event_uuid)
    and (private.is_admin() or (events.is_published and events.pickup_enabled and events.ordering_status = 'open'
      and now() >= coalesce(events.orders_open_at,events.starts_at)
      and now() < least(events.ends_at,coalesce(events.orders_close_at,events.ends_at))
      and exists (select 1 from public.business_settings where singleton and not maintenance_enabled and ordering_status = 'open' and card_enabled)))
  order by slots.starts_at, slots.id limit 10000;
$$;
revoke all on function public.get_pickup_choices(uuid) from public, anon, authenticated;
grant execute on function public.get_pickup_choices(uuid) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;