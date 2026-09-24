begin;

alter table public.business_settings
  add column if not exists maintenance_allowed_emails text not null default ''
  check (char_length(maintenance_allowed_emails) <= 26000);

revoke select on public.business_settings from anon, authenticated;
do $$
declare public_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into public_columns
    from information_schema.columns
    where table_schema = 'public' and table_name = 'business_settings'
      and column_name <> 'maintenance_allowed_emails';
  execute format('grant select (%s) on public.business_settings to anon, authenticated', public_columns);
end;
$$;

create or replace view public.admin_business_settings with (security_barrier = true) as
  select * from public.business_settings where (select private.is_admin())
  with cascaded check option;
revoke all on public.admin_business_settings from public, anon, authenticated;
grant select, update on public.admin_business_settings to authenticated;

commit;