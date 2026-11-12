begin;

alter table public.business_settings
  add column if not exists homepage_hero_eyebrow text not null
    default 'Mexican-Inspired Street Food with a Global Twist'
    check (char_length(homepage_hero_eyebrow) between 1 and 120),
  add column if not exists homepage_hero_description text not null
    default 'From slow cooked brisket to butter chicken tacos, we bring our own twist to street food across South Wales'
    check (char_length(homepage_hero_description) between 1 and 500);

create or replace view public.admin_business_settings
with (security_invoker = true, security_barrier = true) as
  select * from public.business_settings
  where (select private.is_admin())
  with cascaded check option;

revoke all on public.admin_business_settings from public, anon, authenticated;
grant select, update on public.admin_business_settings to authenticated;

notify pgrst, 'reload schema';

commit;
