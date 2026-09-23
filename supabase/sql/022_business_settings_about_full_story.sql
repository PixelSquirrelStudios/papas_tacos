begin;

alter table public.business_settings
  add column if not exists about_full_story text not null default U&'<p><strong>Papa\2019s Tacos is all about bold flavours, fresh ingredients and seriously good street food.</strong></p><p>Inspired by the flavours of Mexico and Latin America, we serve our own take on tacos, loaded nachos, Chilean completos and more \2014 all homemade, packed with flavour and served with a little Papa\2019s personality.</p><p>For us, great street food is about more than what is on the plate. It is the markets, festivals, venues and celebrations where people come together, share good food and leave happy.</p><blockquote>Mexican soul. Street food spirit. Made fresh.</blockquote><p>You\2019ll find us popping up across South Wales, and we\2019re also available for weddings, parties, corporate events and private bookings.</p><p>Want Papa\2019s at your next event? <a href="/contact">We\2019d love to hear from you.</a></p>'
  check (char_length(about_full_story) between 1 and 20000);

commit;