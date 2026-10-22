begin;

alter table public.events add column if not exists is_private boolean not null default false;

create table if not exists private.event_ordering_keys (
  event_id uuid primary key references public.events(id) on delete cascade,
  access_key text not null default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
);
revoke all on private.event_ordering_keys from public, anon, authenticated;

create or replace function public.admin_event_ordering_key(event_uuid uuid)
returns table (access_key text) language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if not exists (select 1 from public.events where id = event_uuid) then raise exception 'Event not found'; end if;
  insert into private.event_ordering_keys(event_id) values(event_uuid) on conflict do nothing;
  return query select keys.access_key from private.event_ordering_keys keys where keys.event_id = event_uuid;
end;
$$;
revoke all on function public.admin_event_ordering_key(uuid) from public, anon;
grant execute on function public.admin_event_ordering_key(uuid) to authenticated;

create or replace function public.check_event_ordering_access(event_uuid uuid, supplied_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.event_ordering_keys keys join public.events events on events.id = keys.event_id
    where keys.event_id = event_uuid and keys.access_key = supplied_key
      and events.is_published and events.ends_at > now()
  );
$$;
revoke all on function public.check_event_ordering_access(uuid,text) from public;
grant execute on function public.check_event_ordering_access(uuid,text) to anon, authenticated, service_role;

create or replace function private.require_event_ordering_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_record public.events%rowtype;
begin
  select * into event_record from public.events where id = new.event_id for share;
  if event_record.is_private and not public.check_event_ordering_access(new.event_id, new.checkout_payload->>'eventAccess') then
    raise exception 'Scan the QR code provided at this event before ordering';
  end if;
  return new;
end;
$$;
revoke all on function private.require_event_ordering_access() from public, anon, authenticated;
drop trigger if exists orders_require_event_access on public.orders;
create trigger orders_require_event_access before insert on public.orders
  for each row execute function private.require_event_ordering_access();

notify pgrst, 'reload schema';
commit;
