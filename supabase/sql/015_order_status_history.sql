begin;

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_status text check (previous_status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup', 'collected', 'cancelled')),
  status text not null check (status in ('pending_payment', 'ordered', 'preparing', 'ready_for_pickup', 'collected', 'cancelled')),
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index order_status_history_order_idx on public.order_status_history (order_id, created_at);
create index order_status_history_actor_idx on public.order_status_history (changed_by);

create function private.record_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, previous_status, status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.order_status_history (order_id, previous_status, status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

revoke all on function private.record_order_status() from public;

create trigger orders_status_history after insert or update of status on public.orders
for each row execute function private.record_order_status();

alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from anon, authenticated, service_role;
grant select on public.order_status_history to authenticated;
grant select on public.order_status_history to service_role;

create policy order_status_history_read on public.order_status_history for select to authenticated
using (exists (select 1 from public.orders where id = order_id));

commit;