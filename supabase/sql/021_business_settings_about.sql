begin;

alter table public.business_settings
  add column if not exists about_eyebrow text not null default 'Our story' check (char_length(about_eyebrow) between 1 and 100),
  add column if not exists about_heading text not null default U&'A little about Papa\2019s' check (char_length(about_heading) between 1 and 160),
  add column if not exists about_content text not null default U&'Papa\2019s Tacos is all about bold flavours, fresh ingredients and seriously good street food.\000A\000AInspired by the flavours of Mexico and Latin America, we serve our own take on tacos, loaded nachos, Chilean completos and more \2014 all homemade, packed with flavour and served with a little Papa\2019s personality.\000A\000AYou\2019ll find us popping up at markets, festivals and venues across South Wales, and we\2019re also available for weddings, parties, corporate events and private bookings.\000A\000AWant Papa\2019s at your next event? We\2019d love to hear from you.' check (char_length(about_content) between 1 and 10000),
  add column if not exists about_image_path text check (char_length(about_image_path) <= 2000),
  add column if not exists about_image_alt text not null default 'Freshly prepared tacos with salsa and lime' check (char_length(about_image_alt) between 1 and 300);

commit;