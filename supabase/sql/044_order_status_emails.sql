begin;

create table if not exists public.order_status_emails (
  id uuid primary key references public.order_status_history(id) on delete restrict,
  sequence bigint generated always as identity unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  status text not null check (status in ('preparing', 'ready_for_pickup', 'collected', 'cancelled')),
  order_snapshot jsonb not null check (jsonb_typeof(order_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  payload jsonb check (jsonb_typeof(payload) = 'object'),
  payload_created_at timestamptz,
  sent_at timestamptz,
  resend_email_id text,
  unique (order_id, status),
  check ((payload is null) = (payload_created_at is null)),
  check ((sent_at is null) = (resend_email_id is null))
);

create index if not exists order_status_emails_pending_idx on public.order_status_emails(sequence) where sent_at is null;
alter table public.order_status_emails enable row level security;
revoke all on public.order_status_emails from public, anon, authenticated, service_role;
revoke all on sequence public.order_status_emails_sequence_seq from public, anon, authenticated, service_role;
grant select on public.order_status_emails to service_role;
grant update (payload, payload_created_at, sent_at, resend_email_id) on public.order_status_emails to service_role;

create or replace function private.queue_order_status_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  if new.status not in ('preparing', 'ready_for_pickup', 'collected', 'cancelled') then return new; end if;
  select to_jsonb(orders) || jsonb_build_object(
    'order_items', coalesce((select jsonb_agg(to_jsonb(items) || jsonb_build_object(
      'order_item_modifiers', coalesce((select jsonb_agg(to_jsonb(modifiers) order by modifiers.created_at, modifiers.id)
        from public.order_item_modifiers modifiers where modifiers.order_item_id = items.id), '[]'::jsonb)
    ) order by items.created_at, items.id) from public.order_items items where items.order_id = orders.id), '[]'::jsonb),
    'order_status_history', '[]'::jsonb
  ) into snapshot from public.orders orders where orders.id = new.order_id;
  insert into public.order_status_emails(id, order_id, status, order_snapshot, created_at)
  values (new.id, new.order_id, new.status, snapshot, new.created_at)
  on conflict (order_id, status) do nothing;
  return new;
end;
$$;
revoke all on function private.queue_order_status_email() from public, anon, authenticated, service_role;
drop trigger if exists order_status_email_queue on public.order_status_history;
create trigger order_status_email_queue after insert on public.order_status_history
for each row execute function private.queue_order_status_email();
notify pgrst, 'reload schema';
commit;