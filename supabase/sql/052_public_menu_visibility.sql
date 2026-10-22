begin;

alter table public.business_settings
  add column if not exists public_menu_enabled boolean not null default true;

create or replace view public.admin_business_settings
with (security_invoker = true, security_barrier = true) as
  select * from public.business_settings
  where (select private.is_admin())
  with cascaded check option;

revoke all on public.admin_business_settings from public, anon, authenticated;
grant select, update on public.admin_business_settings to authenticated;

notify pgrst, 'reload schema';

commit;
