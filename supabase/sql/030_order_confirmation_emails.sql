begin;

create table if not exists public.order_confirmation_emails (
  order_id uuid primary key references public.orders(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  resend_email_id text,
  check ((sent_at is null) = (resend_email_id is null))
);

alter table public.order_confirmation_emails enable row level security;
revoke all on public.order_confirmation_emails from public, anon, authenticated, service_role;
grant select, insert on public.order_confirmation_emails to service_role;
grant update (sent_at, resend_email_id) on public.order_confirmation_emails to service_role;

notify pgrst, 'reload schema';
commit;