begin;

insert into public.menu_categories (name, slug, description, sort_order, is_published)
values
  ('Tacos', 'tacos', 'Soft-shell corn tortillas. Mix and match: 2 for GBP 8 or 3 for GBP 10.', 10, true),
  ('Nachos', 'nachos', 'Lightly salted corn tortilla chips.', 20, true),
  ('Completos', 'completos', 'Chilean hotdogs, served with tortilla chips and a nacho cheese dip.', 30, true),
  ('Churros', 'churros', 'Four large cinnamon-sugar churros per portion.', 40, true),
  ('Extras', 'extras', 'Dips and sauces.', 50, true)
on conflict (slug) do nothing;

with client_menu_seed (category_slug, slug, name, description, price_pence, sort_order, is_featured) as (
values
  ('tacos', 'two-tacos', '2 Tacos', 'Two soft-shell corn tortillas. Mix and match your fillings. Ember Chicken: tender diced chicken in a rich, smoky tomato sauce, seasoned with paprika, cumin, coriander, ancho chilli and a touch of chipotle. Midnight Beef: seasoned ground beef simmered with smoked paprika, ancho chilli, cumin and oregano in a deep, rich and savoury sauce. Smoky Skull Black Bean: black beans cooked with smoked paprika, ancho chilli, cumin and chipotle in a rich tomato sauce, finished with fresh lime. Smoky, gently spiced and completely vegan filling.', 800, 10, false),
  ('tacos', 'three-tacos', '3 Tacos', 'Three soft-shell corn tortillas. Mix and match your fillings. Ember Chicken: tender diced chicken in a rich, smoky tomato sauce, seasoned with paprika, cumin, coriander, ancho chilli and a touch of chipotle. Midnight Beef: seasoned ground beef simmered with smoked paprika, ancho chilli, cumin and oregano in a deep, rich and savoury sauce. Smoky Skull Black Bean: black beans cooked with smoked paprika, ancho chilli, cumin and chipotle in a rich tomato sauce, finished with fresh lime. Smoky, gently spiced and completely vegan filling.', 1000, 20, true),
  ('nachos', 'classic-nachos', 'Classic Nachos', 'Crunchy tortilla chips topped with warm nacho cheese sauce, melted mozzarella, salsa and sour cream, with optional jalapenos.', 700, 10, true),
  ('nachos', 'loaded-beef-nachos', 'Loaded Beef Nachos', 'Crunchy tortilla chips loaded with Midnight Beef, warm nacho cheese sauce, melted mozzarella, jalapenos, crispy onions and your choice of sauce.', 1000, 20, true),
  ('completos', 'the-gringo', 'The Gringo', 'A large frankfurter served in a brioche roll with ketchup, mustard and crispy onions. Served with tortilla chips and a nacho cheese dip.', 700, 10, false),
  ('completos', 'the-midnight-dog', 'The Midnight Dog', 'A large frankfurter served in a brioche roll, loaded with melted cheese, Midnight Beef, fresh pico de gallo, jalapenos and crushed tortilla chips, finished with your choice of sauce. Served with tortilla chips and a nacho cheese dip.', 900, 20, false),
  ('churros', 'classic-churros', 'Classic Churros', 'Four large churros dusted with cinnamon sugar and served with your choice of chocolate, salted caramel, or white chocolate and hazelnut dipping sauce.', null, 10, false),
  ('churros', 'oreo-bandido', 'Oreo Bandido', 'Four large cinnamon-sugar churros topped with crushed Oreo biscuits and rich chocolate sauce.', null, 20, false),
  ('churros', 'biscoff-dorado', 'Biscoff Dorado', 'Four large cinnamon-sugar churros topped with crushed Biscoff biscuits and salted caramel sauce.', null, 30, false),
  ('churros', 'bueno-loco', 'Bueno Loco', 'Four large cinnamon-sugar churros topped with crushed Kinder Bueno and white chocolate and hazelnut sauce.', null, 40, false),
  ('extras', 'extra-churro-dipping-sauce', 'Extra Churro Dipping Sauce', 'An extra pot of chocolate, salted caramel, or white chocolate and hazelnut dipping sauce.', 100, 10, false),
  ('extras', 'pot-of-guacamole', 'Pot of Guacamole', 'A pot of guacamole.', 150, 20, false),
  ('extras', 'pot-of-nacho-cheese-sauce', 'Pot of Nacho Cheese Sauce', 'A pot of nacho cheese sauce.', 150, 30, false)
)
insert into public.menu_items (
  id, category_id, name, slug, description, price_pence, image_path, image_alt,
  dietary_tags, allergens, allergen_note, is_published, is_available, is_featured, sort_order
)
select
  md5('papas-tacos:menu:v1:item:' || seed.slug)::uuid,
  category.id, seed.name, seed.slug, seed.description, coalesce(seed.price_pence, 0),
  case when seed.category_slug = 'tacos' then 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1000&q=80' end,
  case when seed.category_slug = 'tacos' then 'Illustrative stock photo of tacos, not the actual Papa''s Tacos dish' else '' end,
  '{}', '{}',
  'Allergen information is awaiting confirmation. Ask the team before ordering; an empty allergen list does not mean allergen-free.',
  seed.price_pence is not null, false, seed.is_featured, seed.sort_order
from client_menu_seed seed
join public.menu_categories category on category.slug = seed.category_slug
on conflict (id) do nothing;

insert into public.modifier_groups (id, name, min_selections, max_selections, is_published)
select md5('papas-tacos:menu:v1:group:' || slug)::uuid, name, minimum, 1, published
from (values
  ('taco-1', 'Taco 1 filling', 1, true),
  ('taco-2', 'Taco 2 filling', 1, true),
  ('taco-3', 'Taco 3 filling', 1, true),
  ('classic-nachos-jalapenos', 'Add jalapenos', 0, true),
  ('churro-dip', 'Churro dipping sauce', 1, true),
  ('savoury-sauce', 'Sauce choice', 1, false)
) as groups(slug, name, minimum, published)
on conflict (id) do nothing;

insert into public.modifier_options (id, modifier_group_id, name, price_pence, sort_order)
select
  md5('papas-tacos:menu:v1:option:' || groups.slug || ':' || fillings.slug)::uuid,
  md5('papas-tacos:menu:v1:group:' || groups.slug)::uuid,
  fillings.name, 0, fillings.sort_order
from (values ('taco-1'), ('taco-2'), ('taco-3')) as groups(slug)
cross join (values
  ('ember-chicken', 'Ember Chicken', 10),
  ('midnight-beef', 'Midnight Beef', 20),
  ('smoky-skull-black-bean', 'Smoky Skull Black Bean (vegan filling)', 30)
) as fillings(slug, name, sort_order)
on conflict (id) do nothing;

insert into public.modifier_options (id, modifier_group_id, name, price_pence, sort_order)
select
  md5('papas-tacos:menu:v1:option:' || group_slug || ':' || slug)::uuid,
  md5('papas-tacos:menu:v1:group:' || group_slug)::uuid,
  name, 0, sort_order
from (values
  ('classic-nachos-jalapenos', 'jalapenos', 'Jalapenos', 10),
  ('churro-dip', 'chocolate', 'Chocolate', 10),
  ('churro-dip', 'salted-caramel', 'Salted caramel', 20),
  ('churro-dip', 'white-chocolate-hazelnut', 'White chocolate and hazelnut', 30)
) as options(group_slug, slug, name, sort_order)
on conflict (id) do nothing;

insert into public.menu_item_modifier_groups (menu_item_id, modifier_group_id, sort_order)
select
  md5('papas-tacos:menu:v1:item:' || item_slug)::uuid,
  md5('papas-tacos:menu:v1:group:' || group_slug)::uuid,
  sort_order
from (values
  ('two-tacos', 'taco-1', 10),
  ('two-tacos', 'taco-2', 20),
  ('three-tacos', 'taco-1', 10),
  ('three-tacos', 'taco-2', 20),
  ('three-tacos', 'taco-3', 30),
  ('classic-nachos', 'classic-nachos-jalapenos', 10),
  ('loaded-beef-nachos', 'savoury-sauce', 10),
  ('the-midnight-dog', 'savoury-sauce', 10),
  ('classic-churros', 'churro-dip', 10),
  ('extra-churro-dipping-sauce', 'churro-dip', 10)
) as associations(item_slug, group_slug, sort_order)
on conflict (menu_item_id, modifier_group_id) do nothing;

commit;