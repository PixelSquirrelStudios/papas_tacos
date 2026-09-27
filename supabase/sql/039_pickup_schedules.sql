begin;

alter table public.events alter column starts_at drop not null;
alter table public.events alter column ends_at drop not null;

create table if not exists public.pickup_schedules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  preparation_minutes integer not null check (preparation_minutes between 1 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '7 days')
);

create or replace function private.generate_pickup_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  step interval;
  times timestamptz[];
begin
  lock table public.pickup_slots in exclusive mode;
  perform 1 from public.events where id = new.event_id and pickup_enabled and ordering_status = 'open' for update;
  if not found then raise exception 'Choose an event with pickup enabled and ordering open'; end if;
  if tg_op = 'UPDATE' and new.event_id <> old.event_id then raise exception 'A schedule cannot be moved to another event'; end if;
  if new.preparation_minutes not between 1 and 1440 or new.ends_at <= new.starts_at
    or new.ends_at > new.starts_at + interval '7 days' then raise exception 'Invalid pickup schedule'; end if;
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
  update public.events set starts_at = new.starts_at, ends_at = new.ends_at,
    orders_open_at = least(now(), new.starts_at), orders_close_at = new.ends_at,
    pickup_lead_minutes = new.preparation_minutes where id = new.event_id;
  insert into public.pickup_slots(event_id, starts_at, ends_at, capacity)
    select new.event_id, value, value + step, 1 from unnest(times) value
    on conflict (event_id, starts_at) do update set capacity = 1 where public.pickup_slots.capacity <> 1;
  return new;
end;
$$;
revoke all on function private.generate_pickup_schedule() from public, anon, authenticated;
drop trigger if exists pickup_schedule_generate on public.pickup_schedules;
create trigger pickup_schedule_generate before insert or update on public.pickup_schedules
for each row execute function private.generate_pickup_schedule();
drop trigger if exists pickup_schedules_updated_at on public.pickup_schedules;
create trigger pickup_schedules_updated_at before update on public.pickup_schedules
for each row execute function private.set_updated_at();

alter table public.pickup_schedules enable row level security;
revoke all on public.pickup_schedules from anon, authenticated;
grant select, insert, update on public.pickup_schedules to authenticated;
grant all on public.pickup_schedules to service_role;
drop policy if exists pickup_schedules_admin on public.pickup_schedules;
create policy pickup_schedules_admin on public.pickup_schedules for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

create or replace function public.admin_lock_pickup_slot(slot_uuid uuid, expected_updated_at timestamptz, locked boolean)
returns public.pickup_slots language plpgsql security definer set search_path = '' as $$
declare result public.pickup_slots;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if locked is null then raise exception 'Choose a lock state'; end if;
  select * into result from public.pickup_slots where id = slot_uuid for update;
  if not found or result.updated_at is distinct from expected_updated_at then raise exception 'Pickup slot changed. Refresh before trying again'; end if;
  if exists (select 1 from public.orders where pickup_slot_id = slot_uuid and status <> 'cancelled') then raise exception 'A taken slot cannot be changed'; end if;
  update public.pickup_slots set is_enabled = not locked where id = slot_uuid returning * into result;
  return result;
end;
$$;
revoke all on function public.admin_lock_pickup_slot(uuid,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.admin_lock_pickup_slot(uuid,timestamptz,boolean) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pickup_schedules') then
    alter publication supabase_realtime add table public.pickup_schedules;
  end if;
end; $$;
notify pgrst, 'reload schema';
commit;