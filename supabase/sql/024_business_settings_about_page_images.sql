begin;

alter table public.business_settings
  add column if not exists about_page_image_1_path text check (char_length(about_page_image_1_path) <= 2000),
  add column if not exists about_page_image_1_alt text not null default U&'Papa\2019s Tacos street food' check (char_length(about_page_image_1_alt) between 1 and 300),
  add column if not exists about_page_image_2_path text check (char_length(about_page_image_2_path) <= 2000),
  add column if not exists about_page_image_2_alt text not null default U&'Papa\2019s Tacos at an event' check (char_length(about_page_image_2_alt) between 1 and 300),
  add column if not exists about_page_image_3_path text check (char_length(about_page_image_3_path) <= 2000),
  add column if not exists about_page_image_3_alt text not null default U&'Papa\2019s Tacos food truck' check (char_length(about_page_image_3_alt) between 1 and 300);

commit;