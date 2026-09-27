begin;

do $$
declare
  definition text;
  previous_guard text := 'if settings.singleton is null or settings.maintenance_enabled or not settings.card_enabled then raise exception ''Card checkout is unavailable''; end if;';
  access_guard text := 'if settings.singleton is null or not settings.card_enabled or (settings.maintenance_enabled and not exists (select 1 from public.profiles where id = customer_uuid and role = ''admin'')) then raise exception ''Card checkout is unavailable''; end if;';
begin
  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  if position('if payment_deadline <= now()' in definition) = 0 then raise exception 'Apply migration 042 first'; end if;
  if position(previous_guard in definition) > 0 then
    execute replace(definition, previous_guard, access_guard);
  elsif position(access_guard in definition) = 0 then
    raise exception 'Unexpected reserve_card_order maintenance guard';
  end if;
end;
$$;

create or replace function public.get_checkout_pickup_choices()
returns table (id uuid, event_id uuid, starts_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, event_title text, venue_name text, status text)
language sql stable security definer set search_path = '' as $$
  select choices.* from public.get_pickup_choices() choices
  join public.events events on events.id = choices.event_id
  where events.is_published and events.pickup_enabled and events.ordering_status = 'open'
    and now() >= coalesce(events.orders_open_at, events.starts_at)
    and now() < least(events.ends_at, coalesce(events.orders_close_at, events.ends_at))
    and exists (select 1 from public.business_settings where singleton and ordering_status = 'open'
      and card_enabled and (not maintenance_enabled or private.is_admin()));
$$;
revoke all on function public.get_checkout_pickup_choices() from public, anon, authenticated;
grant execute on function public.get_checkout_pickup_choices() to anon, authenticated, service_role;
notify pgrst, 'reload schema';
commit;