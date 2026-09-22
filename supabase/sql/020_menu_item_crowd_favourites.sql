begin;

alter table public.menu_items
  add column if not exists is_crowd_favourite boolean not null default false;

commit;