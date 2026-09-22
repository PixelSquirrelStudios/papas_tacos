begin;

create table public.business_settings (
  singleton boolean primary key default true check (singleton),
  business_name text not null default 'Papa''s Tacos',
  ordering_status text not null default 'closed' check (ordering_status in ('open', 'paused', 'closed')),
  ordering_message text check (char_length(ordering_message) <= 300),
  currency text not null default 'gbp' check (currency = 'gbp'),
  timezone text not null default 'Europe/London' check (timezone = 'Europe/London'),
  cash_enabled boolean not null default true,
  card_enabled boolean not null default false,
  service_fee_pence integer not null default 0 check (service_fee_pence between 0 and 10000),
  packaging_fee_pence integer not null default 0 check (packaging_fee_pence between 0 and 10000),
  minimum_order_pence integer not null default 0 check (minimum_order_pence >= 0),
  contact_email text,
  contact_phone text,
  instagram_url text check (instagram_url is null or instagram_url ~ '^https://'),
  facebook_url text check (facebook_url is null or facebook_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

insert into public.business_settings (singleton) values (true);

create trigger business_settings_updated_at before update on public.business_settings
for each row execute function private.set_updated_at();

alter table public.business_settings enable row level security;
revoke all on public.business_settings from anon, authenticated;
grant select on public.business_settings to anon, authenticated;
grant update on public.business_settings to authenticated;
grant all on public.business_settings to service_role;

create policy business_settings_read on public.business_settings for select to anon, authenticated
using (true);
create policy business_settings_admin_update on public.business_settings for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

commit;