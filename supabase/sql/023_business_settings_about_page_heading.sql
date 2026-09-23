begin;

alter table public.business_settings
  add column if not exists about_page_heading text not null default U&'About Papa\2019s Tacos'
  check (char_length(about_page_heading) between 1 and 160);

commit;