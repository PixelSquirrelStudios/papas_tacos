begin;

do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.events'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%orders_close_at <= ends_at%'
  loop
    execute format('alter table public.events drop constraint %I', constraint_name);
  end loop;
end;
$$;

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
    when now() >= coalesce(event_record.orders_close_at, event_record.ends_at) then 'ordering_ended'
    else 'open'
  end;
$$;

-- Preserve existing pricing and booking logic while replacing only the event-time caps.
do $$
declare definition text;
begin
  select pg_get_functiondef('private.guard_new_order()'::regprocedure) into definition;
  definition := replace(definition,
    'slot_record.starts_at < event_record.starts_at or slot_record.ends_at > event_record.ends_at',
    'slot_record.starts_at < coalesce(event_record.orders_open_at, event_record.starts_at) or slot_record.ends_at > coalesce(event_record.orders_close_at, event_record.ends_at)');
  if position('slot_record.starts_at < coalesce(event_record.orders_open_at' in definition) = 0 then
    raise exception 'Unexpected order guard; apply migrations through 046 first';
  end if;
  definition := replace(definition, 'new.pickup_starts_at := event_record.starts_at;',
    'new.pickup_starts_at := coalesce(event_record.orders_open_at, event_record.starts_at);');
  definition := replace(definition, 'new.pickup_ends_at := event_record.ends_at;',
    'new.pickup_ends_at := coalesce(event_record.orders_close_at, event_record.ends_at);');
  execute definition;

  select pg_get_functiondef('public.reserve_card_order(uuid,uuid,jsonb)'::regprocedure) into definition;
  definition := regexp_replace(definition,
    'least\(now\(\) \+ interval ''10 minutes'', event_record.ends_at,\s*coalesce\(event_record.orders_close_at, event_record.ends_at\) \+ interval ''5 minutes''\)',
    'least(now() + interval ''10 minutes'', coalesce(event_record.orders_close_at + interval ''5 minutes'', event_record.ends_at))');
  if position('coalesce(event_record.orders_close_at + interval ''5 minutes'', event_record.ends_at)' in definition) = 0 then
    raise exception 'Unexpected service payment deadline; apply migration 045 first';
  end if;
  definition := replace(definition, 'never beyond the end of service.', 'using the configured ordering window, independently of event times.');
  execute definition;

  select pg_get_functiondef('private.generate_pickup_schedule()'::regprocedure) into definition;
  definition := replace(definition,
    'new.starts_at < selected_event.starts_at or new.ends_at > selected_event.ends_at',
    'new.starts_at < coalesce(selected_event.orders_open_at, selected_event.starts_at) or new.ends_at > coalesce(selected_event.orders_close_at, selected_event.ends_at)');
  if position('new.starts_at < coalesce(selected_event.orders_open_at' in definition) = 0 then
    raise exception 'Unexpected pickup schedule guard; apply migration 041 first';
  end if;
  definition := replace(definition, 'Pickup times must be within the event start and end times',
    'Pickup times must be within the configured ordering window (event times when blank)');
  definition := replace(definition, 'orders_open_at = least(now(), new.starts_at), orders_close_at = new.ends_at,',
    'orders_open_at = coalesce(orders_open_at, least(now(), new.starts_at)), orders_close_at = coalesce(orders_close_at, new.ends_at),');
  execute definition;

  select pg_get_functiondef('public.get_pickup_choices(uuid)'::regprocedure) into definition;
  definition := replace(definition, 'least(events.ends_at,coalesce(events.orders_close_at,events.ends_at))',
    'coalesce(events.orders_close_at,events.ends_at)');
  execute definition;
end;
$$;

create or replace function private.validate_pickup_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_record public.events%rowtype;
begin
  select * into event_record from public.events where id = new.event_id for share;
  if not found or new.starts_at < coalesce(event_record.orders_open_at, event_record.starts_at)
    or new.ends_at > coalesce(event_record.orders_close_at, event_record.ends_at) then
    raise exception 'Pickup slots must be within the configured ordering window (event times when blank)';
  end if;
  return new;
end;
$$;

create or replace function public.get_checkout_pickup_choices()
returns table (id uuid, event_id uuid, starts_at timestamptz, ends_at timestamptz,
  updated_at timestamptz, event_title text, venue_name text, status text)
language sql stable security definer set search_path = '' as $$
  select choices.* from public.get_pickup_choices() choices
  join public.events events on events.id = choices.event_id
  where events.service_mode = 'pickup' and events.is_published and events.pickup_enabled and events.ordering_status = 'open'
    and now() >= coalesce(events.orders_open_at, events.starts_at)
    and now() < coalesce(events.orders_close_at, events.ends_at)
    and exists (select 1 from public.business_settings where singleton and ordering_status = 'open'
      and card_enabled and (not maintenance_enabled or private.is_admin()));
$$;

create or replace function public.check_event_ordering_access(event_uuid uuid, supplied_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.event_ordering_keys keys join public.events events on events.id = keys.event_id
    where keys.event_id = event_uuid and keys.access_key = supplied_key
      and events.is_published and greatest(events.ends_at, coalesce(events.orders_close_at, events.ends_at)) > now()
  );
$$;

notify pgrst, 'reload schema';
commit;
