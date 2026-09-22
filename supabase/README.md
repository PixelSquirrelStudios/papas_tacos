# Supabase database setup

## Apply the SQL

These are initial-install scripts for a new Supabase project. They assume Supabase's
existing `auth.users`, `auth.uid()`, `anon`, `authenticated`, and `service_role` objects.
Do not create those objects yourself in Supabase; the local test harness only emulates them.

1. Open your project in Supabase Dashboard and select **SQL Editor**.
2. Run each file in `supabase/sql/` separately, in the numbered order below, using the SQL Editor's default `postgres` role.
3. Wait for success before moving to the next file. Each file has its own transaction.
4. If a script fails, stop and resolve the error. Do not run later files or drop existing tables.
5. After all scripts succeed, check Table Editor for the 16 application tables.

Run these files once. They deliberately do not silently overwrite existing schemas.
If you already have tables or triggers with these names, review the conflict before proceeding.
The folder is a manual SQL install sequence, not a Supabase CLI migration directory.

| Order | File | Purpose |
| --- | --- | --- |
| 000 | [000_helpers.sql](sql/000_helpers.sql) | Private helper schema and timestamp trigger |
| 001 | [001_profiles.sql](sql/001_profiles.sql) | Auth-linked profiles, roles, automatic profile creation |
| 002 | [002_business_settings.sql](sql/002_business_settings.sql) | Global ordering controls, fees, payment availability |
| 003 | [003_events.sql](sql/003_events.sql) | Events, pickup toggles, event ordering status/windows |
| 004 | [004_menu_categories.sql](sql/004_menu_categories.sql) | Menu categories |
| 005 | [005_menu_items.sql](sql/005_menu_items.sql) | Menu items, prices, allergens, availability |
| 006 | [006_modifier_groups.sql](sql/006_modifier_groups.sql) | Required/optional customisation groups and limits |
| 007 | [007_modifier_options.sql](sql/007_modifier_options.sql) | Extra choices, prices, allergens |
| 008 | [008_menu_item_modifier_groups.sql](sql/008_menu_item_modifier_groups.sql) | Attach customisation groups to items |
| 009 | [009_testimonials.sql](sql/009_testimonials.sql) | Published/featured customer reviews |
| 010 | [010_pickup_slots.sql](sql/010_pickup_slots.sql) | Event collection windows and capacity |
| 011 | [011_orders.sql](sql/011_orders.sql) | Orders, snapshots, totals, checkout guards |
| 012 | [012_order_items.sql](sql/012_order_items.sql) | Historical item names and prices |
| 013 | [013_order_item_modifiers.sql](sql/013_order_item_modifiers.sql) | Historical customisations |
| 014 | [014_payments.sql](sql/014_payments.sql) | Stripe attempts and cash collection records |
| 015 | [015_order_status_history.sql](sql/015_order_status_history.sql) | Automatic status audit trail |
| 016 | [016_stripe_webhook_events.sql](sql/016_stripe_webhook_events.sql) | Unique processed Stripe event IDs |
| 017 | [017_order_operations.sql](sql/017_order_operations.sql) | Admin status/cash RPCs and booked-slot protections |

Files 001-016 each create exactly one application table, with its indexes, grants,
policies, and associated triggers. Files 000 and 017 contain supporting functions, not extra tables.

### Stage 3 image storage

To populate the supplied client menu after installation, run
[seeds/001_client_menu.sql](seeds/001_client_menu.sql). This is an optional data seed,
not another table migration. Follow the [seed instructions](seeds/README.md) for
missing churro prices, sauce choices, allergen review and temporary imagery.

After the table scripts, run [storage/001_public_media.sql](storage/001_public_media.sql) once.
It creates the public business-image bucket with admin-only writes. No new application table is added.
See [the content setup guide](../docs/CATALOGUE_SETUP.md) for publishing menu items, events and images.

## Admin Listing Upgrades

For an existing database, apply [018_admin_management.sql](sql/018_admin_management.sql),
then [019_modifier_group_ordering.sql](sql/019_modifier_group_ordering.sql). Do not rerun
the initial table scripts. Upgrade 019 adds modifier-group display ordering and extends
the admin-only, conflict-checked reorder function without changing item-specific assignments.

Dedicated drag-and-drop pages are available at `/admin/menu/reorder`,
`/admin/categories/reorder`, `/admin/modifiers/reorder`, `/admin/options/reorder`,
`/admin/events/reorder`, and `/admin/testimonials/reorder`. Menu items are scoped by category;
options by modifier group. Changes are staged until **Save Order**. Pickup slots and
customer orders retain chronological/workflow ordering; site settings are a single record.

## Menu Highlights Upgrade

For an existing database, run only
[020_menu_item_crowd_favourites.sql](sql/020_menu_item_crowd_favourites.sql) to add the new menu highlight.
It adds `menu_items.is_crowd_favourite`, defaulting to false, and can be rerun without changing selections.
The existing `is_featured` column now displays as **Papa's Choice** for menu items; no rename or data reset is needed.
No other table or access policy changes are required. Include 020 after 019 for a new installation too.

In **Admin > Menu Items**, edit each dish and select **Papa's Choice**, **Crowd Favourites**, or both.
The homepage shows up to three published items per row, Papa's Choice first, using the existing category/item ordering.
Select at least three published dishes in each group to fill both rows. Testimonial Featured settings are unchanged.

## First admin account

New users always get the `customer` role, even if signup metadata contains a role.
Profiles are also backfilled for any existing auth users during installation.
No passwords or auth users are inserted directly by these scripts.

After your owner account exists in **Authentication > Users**, use its UUID in SQL Editor:

```sql
update public.profiles
set role = 'admin'
where id = 'REPLACE_WITH_OWNER_AUTH_USER_UUID'::uuid
returning id, full_name, role;
```

Verify exactly the intended row is returned. Profile IDs match Supabase Auth IDs.
Neither customers nor signed-in admins can edit role values through the browser API.
Role provisioning is intentionally a privileged SQL/server operation.

## Ordering controls

`business_settings` has one row. `ordering_status` applies across the whole business.
Each event has `pickup_enabled` plus its own `ordering_status`.

| Control | Effect on new orders |
| --- | --- |
| Global `closed` | Reject for every event until explicitly reopened |
| Global `paused` | Temporarily reject for every event until explicitly resumed |
| Event `pickup_enabled = false` | Event can remain public, but cannot accept pickup orders |
| Event `closed` or `paused` | Reject for that event only |
| Global and event `open`, pickup enabled | Allow only if publication, window, slot, capacity, lead time, payment method, and minimum/fee checks also pass |

Pause and close both reject new checkout attempts. They express different customer-facing messages;
neither automatically resumes, changes other events' settings, cancels orders, nor hides orders already placed.
Existing card payment reservations are existing orders, not new checkout attempts. Their eventual
completion/cancellation policy will be implemented with Stripe in the checkout stage.

`orders_open_at` allows advance ordering to start at a specific time. `orders_close_at`
is an optional cutoff; otherwise ordering ends at the event's `ends_at`.
All timestamps are `timestamptz`; the app will display them in `Europe/London`, including daylight saving.
Slot capacity counts orders, not individual tacos. Disabled slots accept no new bookings.
Booked slots cannot be moved; disabling them preserves existing pickup commitments.
Events with referenced slots/orders cannot be deleted. Unpublish or close those events instead.

The public, RLS-aware RPC `get_event_ordering_state(event_uuid)` returns `accepting_orders`
and a reason code. It reports event-level eligibility, not live slot availability.
The `orders` insert trigger repeats and extends these checks on the trusted write path.
It locks the settings/event rows and the selected slot while checking capacity.
Missing configuration fails closed. Fees default to zero; changing fees affects new orders only.

## Access model

- Public visitors read published content and public business settings, never customer data.
- Customers read their own profile, orders, items, customisations, and status history.
- Customers update only their own profile's name and phone; they cannot write orders, totals, payments, or roles.
- Admins manage content, events, slots, settings, and see customer orders.
- Admin order changes use `admin_set_order_status(order_uuid, next_status, reason)`.
- Cash collection uses `admin_mark_cash_paid(order_uuid)`, recording one payment and its collecting admin.
- New orders, card payment writes, and webhook processing are server-only using `service_role`.
- Raw payment provider records are admin-only; customers see payment method/status on their order.
- Status history and processed webhook IDs cannot be altered by browser users or the service role.

The `private` schema must not be added to Supabase's exposed API schemas.
Security-definer functions use fixed empty search paths and qualified object names.
Never put a service-role key, Stripe secret, or other private credential in a `NEXT_PUBLIC_*` variable.

## Orders and payments

Cash orders begin `ordered` / `unpaid`. Card orders begin `pending_payment` / `unpaid`
with a reservation expiry no more than 30 minutes away. Card payments are disabled by default.
The normal admin flow is `ordered` -> `preparing` -> `ready_for_pickup` -> `collected`.
An order must have recorded payment before it can be marked collected.
Cancellation requires a reason and does not itself refund a payment.

All monetary values are integer pence in GBP. Item and modifier prices are per unit;
line totals multiply the base price plus extras by quantity. Order totals add the
subtotal and the explicitly recorded fees. Names, prices, allergens, and pickup
details are snapshots, not live joins that change when the menu or event is edited.
Referenced menu items must be archived instead of deleted.
Order numbers are display references and can have gaps; UUIDs and RLS control access.

## Required in later implementation stages

This is a database foundation, not a working checkout or a live payment integration.
The following requirements remain explicit application/integration work:

- Atomic checkout RPC: resolve current item/extra prices, validate option membership and selection limits, availability and quantities, calculate subtotal, then create order/items/modifiers in one transaction. The current schema trusts server-supplied line prices/subtotals; do not accept client totals.
- Use the same `checkout_key` when retrying the same checkout. A unique constraint is protection, not the entire retry/recovery workflow.
- Verify Stripe webhook signatures before database access; process the payment transition and unique webhook event record in the same transaction.
- Lock/recheck order state when confirming payment. Never revive cancelled orders or expired reservations without capacity checks; reconcile/refund late payments safely.
- Align Stripe session expiry with reservations. Run a scheduled expiry job and expire/reconcile Stripe sessions, rather than only hiding expired reservations.
- Implement refunds, customer cancellation rules, receipts, notification delivery/retries, and any VAT breakdown after the business rules are agreed.
- Stage 3 supplies the image bucket/policies in [storage/001_public_media.sql](storage/001_public_media.sql); apply it separately after the table scripts. The admin upload UI remains Stage 5.
- Stage 2 implements server session validation and auth flows. Complete Google, redirect, template, and SMTP configuration using [the auth setup guide](../docs/AUTH_SETUP.md).
- Add private order subscriptions or safe polling when building order tracking. Do not expose private customer records to public realtime channels.
- Define retention/anonymisation before launch. Deleting an auth user removes their profile but intentionally does not erase order contact snapshots or financial records.

## Verification boundaries

`npm run test:db` executes all scripts against PGlite, a local PostgreSQL runtime, with
Supabase auth/roles/default grants emulated. It checks installation, RLS, role escalation,
admin-only edits, ordering gates, slot capacity/reservations, payment/status permissions,
history, immutable snapshots, and nested order privacy.

It does not connect to your hosted Supabase project. Production OAuth, PostgREST,
Storage, Realtime, Stripe, and concurrent checkout/load tests still need integration testing.