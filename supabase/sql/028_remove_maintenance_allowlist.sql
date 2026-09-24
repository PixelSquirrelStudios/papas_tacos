begin;

drop view if exists public.admin_business_settings;

alter table public.business_settings
  drop column if exists maintenance_allowed_emails;

grant select on public.business_settings to anon, authenticated;

create view public.admin_business_settings
with (security_invoker = true, security_barrier = true) as
  select * from public.business_settings
  where (select private.is_admin())
  with cascaded check option;

revoke all on public.admin_business_settings from public, anon, authenticated;
grant select, update on public.admin_business_settings to authenticated;

notify pgrst, 'reload schema';

commit;