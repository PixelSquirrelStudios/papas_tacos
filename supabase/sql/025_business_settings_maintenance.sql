begin;

alter table public.business_settings
  add column if not exists maintenance_enabled boolean not null default false;

commit;