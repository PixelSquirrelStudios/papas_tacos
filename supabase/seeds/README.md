# Client menu seed

## Run

Run [001_client_menu.sql](001_client_menu.sql) in Supabase SQL Editor as the default
`postgres` role, after the existing `sql/000_helpers.sql` through
`sql/017_order_operations.sql` installation has succeeded. Do not rerun those initial
table scripts on an installed database. This seed is the complete additional SQL;
no new tables, schema migration, or permissions changes are needed.

The seed is one transaction. It creates 5 categories, 13 items, 6 modifier groups,
13 options and 10 item/group associations. It does not change ordering settings,
events, accounts, orders, or payments. It has not been executed against your hosted database.

It is safe to rerun: deterministic IDs avoid duplicates, and existing rows are not
overwritten, including edited prices, images, descriptions and publication flags.
Existing category slugs are reused without changing their settings. If a menu item
already uses one of these slugs under a different ID, the transaction fails rather
than merging or overwriting it. Resolve that conflict deliberately before retrying.
Rerunning can restore deleted seed options/associations; do not use this as an ongoing sync.

## Prices and choices

| Item | Price | Choices |
| --- | --- | --- |
| 2 Tacos | GBP 8 | One filling for each of two tacos |
| 3 Tacos | GBP 10 | One filling for each of three tacos |
| Classic Nachos | GBP 7 | Optional jalapenos, no surcharge assumed |
| Loaded Beef Nachos | GBP 10 | Savoury sauce list needed |
| The Gringo | GBP 7 | Fixed recipe |
| The Midnight Dog | GBP 9 | Savoury sauce list needed |
| Classic Churros | Not supplied | One included dipping sauce |
| Oreo Bandido | Not supplied | Fixed topping |
| Biscoff Dorado | Not supplied | Fixed topping |
| Bueno Loco | Not supplied | Fixed topping |
| Extra Churro Dipping Sauce | GBP 1 | One dipping sauce |
| Pot of Guacamole | GBP 1.50 | Fixed portion |
| Pot of Nacho Cheese Sauce | GBP 1.50 | Fixed portion |

Taco filling groups each offer Ember Chicken, Midnight Beef and Smoky Skull Black
Bean. Separate groups allow two or three identical fillings as well as mixed fillings;
the bag disallows selecting the same option ID repeatedly within a single group.
Fillings carry no surcharge. Full filling descriptions are in both taco deal descriptions.

Dipping sauces are chocolate, salted caramel, and white chocolate and hazelnut.
The extra sauce is a separate bag item at GBP 1, not a GBP 1 surcharge on an already
priced dip. The other two extras are also separate items.

## Required review before sale

All items start with `is_available = false`. Priced items are published but show
the site's existing "Sold out" state until approved. To keep the entire menu private
during review, set their `is_published` flags to false as well.

1. Obtain all four churro prices. Their `price_pence = 0` is an internal schema
   placeholder, not a free price: they are unpublished AND unavailable. Set a real
   positive price in integer pence before publishing/enabling them. Do not simply
   publish every row or enable every item with a blanket update.
2. Confirm the sauces for Loaded Beef Nachos and The Midnight Dog, including any
   surcharges. Add them as `modifier_options` under the existing `Sauce choice`
   group, with confirmed prices/allergens, then publish that group. It starts with
   no options and is unpublished; both affected items must stay unavailable until ready.
3. Confirm that Classic Nachos' optional jalapenos are included at no extra charge.
4. Obtain supplier/recipe allergen information, including dips, toppings, tortillas,
   frankfurters, rolls and cross-contact. Populate item AND modifier `allergens` and
   replace the pending-review `allergen_note`. Empty arrays mean unverified, not
   allergen-free. No gluten-free, dairy-free or vegetarian item claims are inferred.
   Only the client's black-bean filling description says vegan; the mixed taco deals
   are not tagged vegan because customers can select meat.
5. Replace or approve photos and confirm descriptions. Enable individual reviewed
   items with `is_available = true`; keep priced drafts unpublished until approved.
6. Leave business ordering closed until checkout/payment implementation is ready.

Use Supabase Table Editor for these updates. The seed intentionally preserves them
on subsequent runs. Never modify the seed and expect rerunning it to overwrite live rows.

## Temporary images

Both taco deals share an illustrative stock photo:

https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1000&q=80

It is not a photo of the client's food. Other items deliberately use the site's
image-unavailable placeholder until suitable photos are supplied. Verify image rights
and replace stock photography before launch; no stock photo is represented as client imagery.

The accompanying application change permits only HTTPS `images.unsplash.com/photo-*`
URLs in addition to the existing storage paths. Deploy that change with this seed;
the older app rejects remote URLs. External photos are fetched by the visitor's
browser, depend on the provider's availability, and are not uploaded by this SQL.

For permanent photos, upload approved files to the Supabase `public-media` bucket,
then replace `image_path` with a bucket-relative path such as `menu/three-tacos.webp`
and update `image_alt`. Use the existing Storage setup script if that bucket has not
been created yet. The original local hero and logos are not changed by this seed.