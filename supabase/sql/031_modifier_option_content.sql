begin;

alter table public.modifier_options
  add column if not exists description text not null default '' check (char_length(description) <= 10000),
  add column if not exists image_path text,
  add column if not exists image_alt text not null default '' check (char_length(image_alt) <= 300);

notify pgrst, 'reload schema';

commit;