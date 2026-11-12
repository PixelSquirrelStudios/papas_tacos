begin;

alter table public.events drop constraint if exists events_service_mode_check;
alter table public.events add constraint events_service_mode_check
  check (service_mode in ('pickup', 'table', 'car', 'walkup'));
alter table public.events drop constraint if exists events_walkup_only_not_orderable;
alter table public.events add constraint events_walkup_only_not_orderable
  check (service_mode <> 'walkup' or not pickup_enabled);

create or replace function private.event_ordering_reason(settings public.business_settings, event_record public.events)
returns text language sql stable set search_path = '' as $$
  select case
    when event_record.service_mode = 'walkup' then 'walkup_only'
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

notify pgrst, 'reload schema';
commit;
