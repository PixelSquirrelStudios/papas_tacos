begin;

create table public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 10 check (capacity between 1 and 1000),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, starts_at),
  unique (id, event_id),
  check (ends_at > starts_at)
);

create function private.validate_pickup_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
begin
  select * into event_record from public.events where id = new.event_id for share;
  if not found or new.starts_at < event_record.starts_at or new.ends_at > event_record.ends_at then
    raise exception 'Pickup slots must be within the event trading hours';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_pickup_slot() from public;

create trigger pickup_slots_validate before insert or update on public.pickup_slots
for each row execute function private.validate_pickup_slot();
create trigger pickup_slots_updated_at before update on public.pickup_slots
for each row execute function private.set_updated_at();

alter table public.pickup_slots enable row level security;
revoke all on public.pickup_slots from anon, authenticated;
grant select on public.pickup_slots to anon, authenticated;
grant insert, update, delete on public.pickup_slots to authenticated;
grant all on public.pickup_slots to service_role;

create policy pickup_slots_read on public.pickup_slots for select to anon, authenticated
using ((select private.is_admin()) or (is_enabled and exists (
  select 1 from public.events where id = event_id and is_published
)));
create policy pickup_slots_admin_write on public.pickup_slots for all to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;