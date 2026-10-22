# Stock and event portions

## Deploy safely

Stock is enforced in PostgreSQL, not just in browser controls. Deploy the database
upgrade and application together; the new application deliberately disables
ordering when stock availability cannot be verified.

1. Back up the database and test the upgrade against a staging copy.
2. Enable maintenance and close ordering. Allow pending payments to finish or
   cancel them through the normal checkout/order controls. Never clear payment
   reservations by editing rows directly.
3. Apply SQL upgrades through `049_repair_customer_profiles.sql`, then
   [050_inventory.sql](../supabase/sql/050_inventory.sql) and
   [051_linked_menu_items.sql](../supabase/sql/051_linked_menu_items.sql). Follow the activation
   checks in the [database guide](../supabase/README.md); do not bypass an active
   order warning.
4. Deploy this application. Existing menu items start **Not tracked**, preserving
   their previous manual-availability behaviour. Historical fulfilled orders are
   not deducted from new opening balances.
5. In **Admin > Stock**, configure tracked items, receive their actual opening
   stock, and allocate the quantities that may be sold at each event. Opening
   counts must reflect stock still owned, not all stock ever purchased.
6. Use Stripe test mode on staging to check last-item ordering, checkout expiry,
   paid cancellations, event closing and a refund after a late payment. Verify
   webhook delivery/retries and the refund in Stripe, not just the local screen.
7. Reopen ordering only after reviewing opening balances, event allocations and
   customer-facing availability. Monitor payment webhooks during the first event.

Do not enable stock by guessing a balance while orders are in progress.
Automated tests do not replace staging verification against the hosted database,
Stripe and Supabase permissions/realtime configuration.

## Admin checkout testing without a QR code

Sign in with an administrator account, open the public menu, and select the event.
Private events unlock automatically for admins without scanning a QR code.
The ordering information shows an admin notice explaining that this is not a
sandbox. Customers still need the event QR code.

This bypass only removes the QR requirement. The event must still be published,
open for ordering and within its normal ordering window. Menu-set availability,
event stock allocations, pickup capacity and normal payment checks still apply.
Completed orders charge the configured Stripe account and consume real stock.
Use a staging environment with Stripe test mode for no-real-money testing.
If cancelling a test order, use the normal cancellation/refund controls and the
explicit order restock action when the items can be returned to sale.

No database upgrade is required for this admin bypass beyond the existing
private-event upgrade 046. Event keys stay on the server: this does not issue an
event-access cookie that would keep ordering unlocked after signing out.

## Choose a tracking setting

| Setting | Use for | Setup |
| --- | --- | --- |
| Not tracked | Items whose quantities are not managed here | Continue using manual availability. |
| Global stock + event allocations | Cans, packets and other countable products | Receive stock globally, then reserve quantities for events. |
| Event portions only | Meals with a manually estimated preparation capacity | Set the quantity of portions available at each event. No raw ingredient count is required. |

Use a clear unit label, such as `packets`, `cans` or `portions`. All quantities are
whole numbers. Linked menu-item choices consume their actual product stock, as
described below. Ordinary modifiers, recipe ingredients and shared ingredient
pools are not automatically depleted. Portions of tacos and nachos are independent
limits even if both use the same ingredients.

## Drinks, sweets and linked menu items

Create each actual product as a **Menu Item**, for example Coca-Cola 330ml,
Fanta Orange 330ml and Wine Gums. Each owns its price, description, image,
allergens, global balance and event allocations.

Use **Menu item kind** to distinguish:

- **Product / meal:** can consume its own stock and selected linked products.
- **Grouped listing:** a container such as Cans of Pop. It has zero base price
  and cannot track stock itself. The selected linked products consume stock.

Turn **Show as a standalone menu item** off when a product should appear only
inside choices. This does not unpublish it. It must still be published, have a
published category, be manually available, and have event stock if tracked.
A linked product does not need its own entry in the event's menu set.

### Example: Cans of Pop

1. Create Coca-Cola and Fanta Orange as product menu items. Set their own prices.
   Keep them published; switch off standalone visibility if desired.
2. Configure their stock in **Admin > Stock** and allocate cans to the event.
3. Create a published modifier group named **Choose your drink**, with minimum
   and maximum choices both set to **1**.
4. Add a modifier option to that group. Choose **Linked menu item > Coca-Cola**.
   Select **Use linked item's price**, quantity **1**, and save. Repeat for Fanta.
   The customer's label, description, image and allergens come from the product,
   not the option's old text.
5. Create or edit **Cans of Pop**, choose **Grouped listing**, attach the required
   Choose your drink group, and add the listing to the event's menu set.

Ordering two Cans of Pop with Fanta selected consumes two Fanta cans and no
generic Cans of Pop stock. Fanta can sell out while Coke remains available.
If no required product choice can be fulfilled, the listing is unavailable.
Grouped listings must have a required group and the customer must select an
actual linked product; a standard customisation alone is insufficient.
In the bag, selections from the same grouped listing share one heading and
section total. Each selection retains its own unit price, quantity, edit and
remove controls; checkout and stock accounting still treat them independently.
Admin grouped cards display **Priced by choices**, and linked options using
product pricing display the inherited price including their quantity multiplier.

### Pricing and meal deals

- **Use linked item's price:** charges the linked product's standard price
  multiplied by the units per choice. The extra-price field is zero; menu-set
  price overrides on the product do not apply when it is used as a choice.
- **Included / fixed surcharge:** the product is included in the parent's base
  price, plus the option's fixed extra price if any. This surcharge is per choice,
  not per linked unit. Set it to zero for a fully included drink.

A taco meal can consume one taco portion plus its selected can. A standalone
Fanta, a Fanta inside Cans of Pop and a Fanta inside a meal deal all consume the
same Fanta balance. Quantities are aggregated across choices, nested choice-group
paths and bag lines before checkout is accepted.

For clarity, a grouped listing has no base price or menu-set price override.
Its displayed From price is calculated from the available required choices.
Use a normal product / meal when there should be a base meal charge.

Only **simple products without any choice groups** can be linked in this
version. Grouped listings cannot be link targets, and linked products cannot
later acquire their own choice groups. This avoids circular links and silently
skipping required or optional customisations.

### Updating an existing flavour modifier

No existing modifiers or test orders are automatically deleted or converted.
Create the actual product first, then edit the existing flavour option to link
it. Its stock starts from the product's explicit opening balance. Do not also
track the old generic parent as a can or packet: change it to a grouped listing
after reconciling any old stock and allocations.

Existing tracked stock, allocations and active checkouts must be resolved before
converting a product to a grouped listing. Future checkout records capture their
product usage so later catalogue edits cannot alter an order's stock commitment.

Changing tracking mode is not a way to bypass stock limits. Resolve stock,
allocations and outstanding order commitments first, following the explanation
shown by the database guard.

## Understand the balances

- **Global on hand:** unsold products still owned, including products at events.
- **Allocated remaining:** unsold stock reserved for events, including temporary
  checkout holds.
- **Checkout holds:** products reserved by customers currently paying. These are
  not completed sales.
- **Event available:** that event's remaining allocation minus active holds.
- **Unallocated:** global stock not reserved for any event.
- **Sold (net):** online and recorded walk-up stock sales, less explicit
  cancelled-order stock restoration. Expand the total to see each event. This
  excludes untracked items and sales before tracking began. A refund without
  restocking does not reduce this quantity; waste is recorded separately.

Allocating stock does not sell it. A confirmed sale reduces both global on hand
and its event allocation. Returning unused stock only releases the allocation:
it does not add to the global count again.

Example: receive 40 packets, allocate 10, sell 9, return the last packet. The
result is **31 globally on hand, 0 allocated, 31 unallocated**.

Manual availability, publication, event ordering windows and private-event
access still apply. An event with no allocation cannot sell a tracked item.
Having no unallocated stock does not stop events selling their existing
allocations. Customer bags do not reserve stock; starting checkout does.

## Everyday admin workflow

1. **Receive stock** for deliveries. Add a supplier/invoice reference if useful.
2. **Set event allocation** before opening event ordering. Enter the target
   *remaining unsold quantity*, not an increment. If 9 of 10 have sold and you
   want another 5 available, set the remaining quantity to 6.
3. **Record walk-up sale** promptly for sales outside the website. This updates
   stock only; it does not record a payment or create a customer order.
4. **Record waste / damage** for products that cannot be sold. Choose the event
   allocation or unallocated global stock as the source.
5. At closing, close ordering and allow active checkouts to resolve. Count the
   leftovers, record any waste, then **Return all unused stock**. The preview
   shows each item; the entire return is checked and applied together.

The bulk return makes packaged goods available to allocate elsewhere. For
event-only portions, it removes unused event capacity; it does not carry prepared
food into another event automatically.

Use **Correct global count** only for an actual physical-count discrepancy.
The new count includes stock at events and cannot undercut their commitments.
Stock activity records reasons and links to associated orders. The screen shows
an editable, pre-filled reason for each stock action, so routine updates need no
extra typing. Changing the action updates the default reason but preserves a
custom note. A non-blank reason is still required for the audit trail.

The screen shows
the most recent 100 movements. Low-stock highlighting means five or fewer units
of the relevant item, not a combined total of unlike products.

## Cancellations and refunds

An abandoned or cancelled unpaid checkout releases its hold. Cancelling or
refunding a confirmed sale does **not** assume its food is reusable and does not
automatically add stock.

For a cancelled order whose tracked products are all reusable, open the admin
order detail and choose **Restore reusable stock**. Enter a reason. Restoration
is explicit and can happen only once. If only some products are reusable, use
item-level stock adjustments instead; do not restore the entire order.

Stock restoration and a financial refund are separate operations. Verify the
payment/refund record independently. Never restore prepared or wasted food
merely because a customer received a refund.

Late successful payments cannot force stock negative. If their stock is no
longer available, the order is cancelled and the existing Stripe refund workflow
is used. Webhook processing and refunds must remain operational.

## Conflicts and connection problems

The database serializes stock changes and validates the current record version.
Two admins cannot unknowingly overwrite the same balance, and two customers
cannot both consume the last available quantity.

If an allocation is too large, receive more stock or reduce another event's
allocation. If it overlaps an active checkout hold, wait for payment or expiry.
If a count or allocation changed while a dialog was open, close it, refresh the
balances, and review the new values before submitting another change.

If a request's result cannot be confirmed because the connection failed, inspect
the current balance and recent activity before repeating it. Do not compensate
for an uncertain request by blindly adding or subtracting the same quantity.

Balances refresh while the admin screen is visible and no editing dialog is
open. Customers also refresh stock while browsing, but availability is always
rechecked atomically at checkout.

## Verification

Run the repository's database, bag, payment, type and lint checks. Inventory UI
fixtures run on desktop and mobile without creating hosted orders:

```sh
npm run test:db
npm run test:bag
npm run typecheck
npm run lint
npm run test:browser -- inventory.spec.ts
npm run test:browser -- linked-items.spec.ts
npm run test:browser -- bag.spec.ts payments.spec.ts
```

These local database tests use PGlite. They validate SQL behaviour but do not
exercise real multi-connection PostgreSQL scheduling or external Stripe delivery.
