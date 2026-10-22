# Stripe Payments

## Setup

1. Apply [029_stripe_checkout.sql](../supabase/sql/029_stripe_checkout.sql) in Supabase SQL Editor after migrations 000-028, then [030_order_confirmation_emails.sql](../supabase/sql/030_order_confirmation_emails.sql). These add atomic checkout and private confirmation-email delivery records. Both are repeatable. Do not enable checkout before applying them.
2. For testing, set `STRIPE_MODE=test` (also the default when unset) and `STRIPE_SECRET_KEY` to a Stripe `sk_test_` key. Keep this and `SUPABASE_SECRET_KEY` server-only. Hosted Checkout does not need the publishable key in the browser.
3. Run `npm run dev`, then `npm run stripe:listen` in a second terminal. The listener uses the Stripe CLI, reads the test key from the local environment, and saves `STRIPE_WEBHOOK_SECRET` without printing it. Keep it running while testing. Restart Next.js if it does not reload the environment change.
4. In Site Settings, enable Card Payments and set ordering to Open. Publish an event with pickup enabled and ordering open, then generate its schedule in Admin > Pickup Slots as described below. Maintenance restricts access to verified admins, but does not close ordering; disable it when opening to customers.
5. Sign in, add available menu items, open `/checkout`, select pickup/contact details, and pay on Stripe's hosted page.

The portable CLI is installed locally at `%LOCALAPPDATA%\StripeCLI\stripe.exe` on this development machine. Elsewhere, install the official [Stripe CLI](https://docs.stripe.com/stripe-cli). Set `STRIPE_CLI_PATH` if it is not on PATH. Set `STRIPE_FORWARD_ORIGIN=http://localhost:3001` when the app uses another port. Local forwarding uses the CLI's connection to Stripe; no application WebSocket endpoint is required.

Never commit environment files or expose secret keys as `NEXT_PUBLIC_*` variables. The local CLI signing secret is not the secret for a deployed webhook endpoint.

## Live payments

The application supports one Stripe mode per deployment. It refuses mismatched mode/key
configuration and rejects signed webhook events from the other mode before database writes.
To enable real payments:

1. Complete Stripe account activation, business verification and payout bank details.
2. Apply database upgrades through 049. Keep ordering closed while switching modes and resolve
   outstanding test reservations first. Prefer separate test/staging and live databases so test
   orders, email deliveries and reports are not mixed with real sales.
3. In Stripe live mode, create a **Snapshot events** webhook destination at
   `https://www.papastacos.co.uk/api/stripe/webhook`, subscribing to
   `checkout.session.completed`, `checkout.session.expired` and `charge.refunded`.
   Use the snapshot API version matching the installed Stripe SDK's API version.
4. In production hosting, set `STRIPE_MODE=live`, the matching `STRIPE_SECRET_KEY=sk_live_...`,
   and that live endpoint's `STRIPE_WEBHOOK_SECRET=whsec_...`. Never share or commit their values.
   Deploy/restart so all three take effect together. Updating local environment variables alone
   does not update production.
5. Confirm production `SITE_URL`, Supabase configuration, email sender and event ordering settings.
6. Make one small real card payment, verify the webhook succeeds, the order is marked paid and
   the confirmation email arrives. Verify a full refund updates the order too. Test cancellation,
   retry, duplicate webhook delivery and late-payment refund handling in staging.

Only card payments are enabled. Delayed payment methods require additional async webhook
handlers before activation. Do not run the local Stripe listener against live credentials;
it is test-only and can replace the local webhook signing secret.

## Table and Car Service

After all upgrades through [044_order_status_emails.sql](../supabase/sql/044_order_status_emails.sql),
apply [045_table_car_ordering.sql](../supabase/sql/045_table_car_ordering.sql) in SQL Editor.
It is repeatable and preserves existing pickup orders. The app does not apply hosted SQL automatically.
If an earlier function migration is reapplied, reapply 045, 046 and 047 in order afterward.

For QR-only private ordering, also apply
[046_private_event_ordering.sql](../supabase/sql/046_private_event_ordering.sql) after 045.
The **Private Ordering (event QR code required)** switch keeps an event visible on the public
events listing/detail page, but blocks ordering unless the attendee has opened its secret QR link.
Public pages explain that the QR code is provided at the event and do not expose an ordering key.
Scanning before opening still selects the event and lets customers browse, with an
opening date/time notice and disabled **Orders Open Later** buttons. Paused and closed
ordering show their own status and reassure customers that existing orders are unaffected.
Invalid, expired and temporarily unverifiable private QR links redirect without the secret
to a styled help page; they never grant ordering access or select a different event.

The menu URL controls browsing/ordering context: `/menu` uses public pickup availability
and does not show an event selector or private delivery information. `/menu?event=<id>`
uses only that event and displays its ordering information; an unavailable event does
not fall back to public ordering. QR access cookies unlock private events but do not
select them on the public menu. Local storage retains the bag's fulfilment event for
bag/checkout continuity, not menu context. Browsing another menu never silently changes
an existing bag: adding an item from a different context requires confirmation first.

For menu sets, apply [048_menu_sets.sql](../supabase/sql/048_menu_sets.sql) after 047
before deploying the corresponding app changes. Manage **Admin > Menu Sets** and
choose a set in the event editor. The default public set is seeded from the existing
published menu. Event overrides can change item base prices, not modifier prices.
Checkout resolves the event from its pickup slot or service event, rejects items
outside that menu, recomputes the effective prices and requires the customer's
displayed total to match. Existing order and Stripe line-item snapshots stay unchanged.
The ordinary `/menu?event=...` link, manually selecting an event, or directly calling checkout
cannot unlock a private event. Access is checked again when the order is created in the database.

Private QR codes use a separate unguessable key held outside public event data. Scanning validates
the key and saves it in an HTTP-only, same-site browser cookie for up to seven days; event publication,
expiry and ordering controls still apply. The menu URL is then cleaned of the secret, and access survives
sign-in on the same browser. Cookie restrictions or another browser/device may require another scan.
Download/print the QR again after enabling private ordering: a previously printed public QR will not unlock it.
The **Open Event Menu** link in the admin QR dialog uses the same private access link as the printed code.
An attendee can still forward the QR or its link: this is QR-link access, not proof of physical attendance.
Event-specific bags retain their event when adding more items. Car/table, private and custom-set
events are shown as fixed ordering details rather than a changeable event dropdown. Signed-in
customers do not see the public header menu shortcut on an event menu, bag or checkout.
After a confirmed paid order clears the matching bag, its saved event selection is cleared too:
the empty bag's Explore the Menu link returns to the public menu. A different or edited bag is
not cleared. Opening the event QR link again starts another event order; existing QR access
cookies are not revoked by payment. Bag and checkout show loading placeholders until their
initial catalogue request finishes, and car number plates are uppercased as they are entered.
Keep printed codes on menus given to attendees rather than public social posts.

Apply [047_independent_ordering_times.sql](../supabase/sql/047_independent_ordering_times.sql)
after 046 to allow serving/ordering outside the event dates. **Orders Open** can be before the
event starts, and **Orders Close** can be earlier or later than the event ends. Blank fields use
the corresponding event time. Opening must be before closing. Event cards show the configured
serving times; detail pages show both the event dates and serving times. Events remain selectable
while their later ordering window is active, including private QR access.

1. In **Admin > Events**, create an event with **Service Type** set to **Table** or **Car**.
   Existing events default to Pickup. Service type cannot change once an event has orders or a pickup
   schedule; create a new event instead.
2. Set event dates, publish it, enable **Event Ordering Enabled**, and set **Ordering** to Open.
   Global ordering and card payments must also be enabled. Optional **Orders Open / Orders Close**
   values override the default event start/end for accepting new checkouts. All admin dates use Europe/London.
3. Do not generate a pickup schedule for table/car events. They accept orders without slots or
   slot-based capacity limits; pause event ordering when the kitchen needs to catch up.
   Public event cards, detail pages and the selected-event info box use car/table-specific delivery guidance:
   food is brought to the assigned location as soon as possible, with no guaranteed time during busy periods.
4. Use **Ordering QR Code** on the event card to preview or download its SVG for printing.
   Configure `SITE_URL` to the public HTTPS origin before printing; localhost QR codes will not work
   on customers' phones. Test a scan on a real phone before distributing posters.
   QR generation is local to this application, not a third-party QR service.
5. Scanning opens `/menu?event=<event UUID>`. Selection survives bag navigation, sign-in and page reloads.
   Switching an existing bag to a different event requires confirmation. A closed, unpublished or expired
   selected event blocks checkout rather than silently changing events.
6. Table checkout requires **Table Number**. Car checkout requires **Assigned Car Number**, with optional
   **Number Plate**. Order Notes remain separate. Multiple orders may share a table/car number.
   Staff and customer confirmations display the identifier together with the unique order number.
7. The event card's **Outstanding Event Orders** link opens its queue oldest first. Use **Mark As Complete**
   after delivery. Counts cover the selected events/search across all pages, regardless of the current
   status filter. Awaiting-payment and cancelled orders are not outstanding meals. **Reopen Order** corrects
   accidental completion; history records the staff member and timestamp.

Table/car customers receive a payment confirmation and, on completion, a thank-you email encouraging
Facebook feedback / Instagram sharing when those URLs are configured. There are no preparing/ready-for-pickup
emails for this mode. Completion uses the existing `collected` state internally, displayed as **Complete**,
and the 044 email queue. Repeated clicks or reopening/recompleting do not send another thank-you email.
Cancellation emails still apply. Run the existing internal email-retry job described below in production.
Order pages and receipts use delivery wording and retain the original event/location snapshot.
Vehicle registrations are private customer/staff order data, not public event data.

Payment must complete within ten minutes of starting checkout, no later than five minutes after an
explicitly configured ordering close. Without a configured close, the event end remains the deadline.
An explicit later close is not capped by the event end. New checkouts cannot begin after ordering closes.
The Stripe session can remain open longer, but late payments are cancelled and refunded using the existing
verified-webhook deadline handling. Delivery is as soon as possible, not a booked or guaranteed time.
The initial version retains sign-in and card payment; guest checkout and cash-on-delivery are not included.

## Generated Pickup Schedules

After the existing upgrades through 036, apply these separately, in order:

1. [038_remove_admin_checkout_override.sql](../supabase/sql/038_remove_admin_checkout_override.sql) removes the temporary admin exception. Apply it whether or not 037 was installed; do not reapply 037 afterward.
2. [039_pickup_schedules.sql](../supabase/sql/039_pickup_schedules.sql) creates event-owned schedules, generates one-order slots and adds protected admin locking.
3. [040_pickup_availability.sql](../supabase/sql/040_pickup_availability.sql) exposes Available, Taken, Locked and Unavailable states without customer information.
4. [041_preserve_event_times.sql](../supabase/sql/041_preserve_event_times.sql) keeps event dates independent of pickup schedules. Apply after 039-040, including on installations that already applied them. Do not rerun 039 without reapplying 041 afterward.
5. [042_pickup_payment_deadlines.sql](../supabase/sql/042_pickup_payment_deadlines.sql) removes the extra 32-minute pickup delay, keeps the food-order deadline independent of Stripe expiry, and refunds late completions.
6. [043_maintenance_ordering_access.sql](../supabase/sql/043_maintenance_ordering_access.sql) treats maintenance as an admin-only access restriction, not an ordering status. Its checkout-specific slot lookup still checks publication, business/event status and ordering windows.

Apply 042-043 before running this version of checkout/webhook code. No hosted migrations or schedules
are applied by the app. If earlier reservation or availability migrations are rerun, reapply 042 then
043 afterward; do not reintroduce the old 037/038 maintenance behavior after 043.

In the event form, set **Event Starts** and **Event Ends** for every event, including pickup-enabled
events. Enable pickup and set Ordering to Open when taking orders. Pickup timestamps and Preparation
Time are configured only in Pickup Slots. With upgrade 047, the pickup window must fit within the
configured Orders Open/Close window (event times when blank), so pickup service can also extend
outside the event dates. Set extended ordering times before generating that schedule.
Saving a schedule never changes event dates or overwrites explicitly configured ordering times.
An event can be public before its pickup schedule is configured.
041 does not rewrite existing dates: correct any dates previously overwritten by 039 in the event form.

In **Admin > Pickup Slots**, select the event card, then **Set Schedule**. Only pickup-enabled,
open events are selectable in the schedule form. Enter Pickup Starts, Pickup Ends and
**Preparation Time (minutes)**. For example, 12:00-13:00 with 20 minutes creates
12:00-12:20, 12:20-12:40 and 12:40-13:00. Each slot accepts one order. Incomplete trailing intervals
are omitted; the window must fit at least one complete interval. Windows are limited to seven days
and 5,000 generated slots. All form dates use Europe/London, including daylight saving.

The schedule sets preparation notice, but does not set the event's start or end. Ordering starts when
the schedule is saved (or earlier if the pickup window already started), subject to the event and
business Open switches. It ends at the schedule end. Event timestamps remain unchanged when a
schedule is configured. No hosted schedule is regenerated automatically by upgrades.

The right-hand badges show all generated times. Click an unbooked badge to lock or unlock it.
Taken slots cannot be changed. Regeneration preserves matching slot IDs and manual locks and
rejects changes that would move historical bookings or squeeze multiple legacy orders into one slot.
Existing orders, pickup snapshots and payment reservations are preserved.

Changing Preparation Time changes every generated slot's duration. If any existing slot has an
order reference, including cancelled or historical orders, an incompatible change rejects the
entire save before deleting or inserting anything. To reduce new demand without changing booked
commitments, lock unbooked slots or pause event ordering. No bookings are automatically moved or refunded.
On a successful regeneration, incompatible unbooked slots are deleted, including manually locked
ones. Only unchanged slots retain their IDs and locks. Passing the pickup time or event end does
not delete slot rows: there is no automatic slot cleanup job in the app.

Checkout shows only Available pickup slots, as time-only selectors grouped by event and day.
Taken, Locked and Unavailable slots are hidden. A selected slot that becomes unavailable disappears
and prevents payment until an available time is chosen. Availability refreshes every 15 seconds while visible,
on focus/reconnect and catalogue changes; failures disable payment until recovery. SQL rechecks
availability and reserves the chosen slot atomically, so two customers cannot reserve its one place.

Admin retains all slot states and lock controls; on mobile, each date starts collapsed behind a
date-and-count toggle. Desktop displays the full slot grid. The bag shows currently open collection
event names above Find the Truck. Zero service and packaging fees are omitted from the bag, checkout,
customer order details, PDF receipts and confirmation emails; nonzero fees and totals are unchanged.

Preparation Time sets the minimum notice before collection, with **no additional Stripe buffer**.
For example, at 02:26 with 10-minute preparation, an available 02:40 slot can be selected; payment
must complete before 02:30. The deadline is the earlier of preparation starting or one hour after
reservation. A deadline that has already passed cannot open or resume checkout.

Stripe's hosted session expiry is separate: it is fixed at two hours after order creation, keeping
retry requests identical while meeting Stripe's minimum session lifetime. Attaching that session
never extends the food-order deadline. Stripe displays the actual payment deadline in UK time.
The verified webhook uses Stripe's event timestamp, not delivery time, so a delayed webhook for an
on-time payment is accepted while its reservation remains held. Payments at or after the deadline
cancel the order and request an idempotent full refund; they never enter the kitchen queue or send
an order confirmation. Cancellation and refund status appear in Account > Orders.

Maintenance does not change Open/Paused/Closed. Verified admins retain normal ordering access;
customers are blocked at sign-in, page, catalogue API, pickup API and checkout boundaries. The
database checks the customer's stored admin role independently, not a browser-provided override.
Unknown maintenance state blocks checkout. Explicit closed/paused ordering still blocks admins.

## Test Cards

Use `4242 4242 4242 4242`, any future expiry and any three-digit CVC for a successful test payment. Stripe's `4000 0000 0000 9995` card tests insufficient funds. No real money is charged with test keys.

The account return page may briefly show Awaiting Payment. It refreshes automatically; only the verified webhook can mark an order paid. Stripe's redirect query is never proof of payment.

## Orders and Receipts

- Checkout requires a signed-in account. The database calculates current item/choice prices, validates required choices and availability, locks pickup capacity, and stores immutable order snapshots in one transaction. Client totals are comparison values, not trusted prices.
- Retrying unchanged checkout details uses the same checkout key and Stripe idempotency key. Each customer can have at most three pending checkouts. A changed bag/contact selection starts a distinct attempt; cancel unused attempts in Account > Orders.
- Awaiting-payment card orders offer **Continue to Payment** and **Cancel Checkout**. Continuing checks ownership and the food-payment deadline, then reopens the saved Stripe session without reserving another slot or repricing the order. Finished, expired or missing sessions cannot be resumed.
- Order details retain an invoice-style item and total layout. Saved choices appear as plain indented rows under their taco, with extra charges aligned on the right; these are not the bag's cards or choice badges.
- Payment deadlines are at most one hour and never beyond pickup preparation time. Capacity remains held until payment is resolved, a signed Stripe expiry arrives, or explicit cancellation, even after the deadline. This avoids overselling with delayed webhooks; an abandoned hosted session can retain its hold for up to two hours from order creation. Cancel unused attempts in Account > Orders and keep the listener running.
- A session-creation failure can leave an unpaid reservation. Retry the unchanged checkout or cancel it from Account > Orders. There is no background reconciliation worker yet; monitor missed webhook deliveries before production launch.
- Account > Orders > View Order offers View Receipt and Download Receipt after confirmed payment. PDFs use the real local logo, an invoice-style item breakdown with modifier/selection dividers and aligned prices, and repeating contact/page footers. Contact Email and Contact Phone come from Site Settings; the website is `SITE_URL`. Long orders paginate with repeated headers. PDFs use the customer's order/payment snapshots, are protected by ownership checks, and are never publicly cached. Refunded amounts are reflected. They are payment receipts, not VAT invoices. Stripe controls its hosted receipt/invoice layout; this PDF design applies to the app's View/Download Receipt documents.
- Confirmed payment clears only the matching purchased bag. Items added or changed in the meantime are preserved. Retry information is stored in browser session storage and removed after confirmation; it includes checkout contact fields and is not a synced account record.
- Customers can cancel pending checkouts. A payment racing with cancellation never revives the order: it triggers an idempotent full Stripe refund. Refunds initiated in the Stripe Dashboard update order/payment status through `charge.refunded`. Cancelling an already-paid order in admin does not automatically refund it; issue the refund in Stripe.
- Cash collection for existing cash orders remains available in admin, but this new customer checkout is card-only. No customer cash-checkout flow, tax calculation, or production-key support is added here.

## Pickup Confirmation Emails

After a verified Stripe card payment is recorded, Resend sends the customer a branded HTML and
plain-text confirmation. It includes a prominent order number to show staff, the Europe/London
pickup window and location, items and choices, fees, total paid, and a link to the signed-in order
page with receipt downloads. It confirms the order, not that food is already ready for collection.
Cancelled, unpaid and refunded orders do not receive new initial confirmations. The initial
confirmation remains tied to a verified card payment, not simply creating an unpaid reservation.

### Status Updates

Apply [044_order_status_emails.sql](../supabase/sql/044_order_status_emails.sql) after 043 to enable
Preparing, Ready for Pickup, Collected and Cancelled emails. This migration has not been applied
to hosted Supabase by the code changes. It queues an immutable order snapshot in the same
transaction as each new status-history entry. Existing historical stages are not backfilled.
The initial paid-order email continues using the separate confirmation-delivery table.

Admin status controls attempt delivery immediately after the status change. A failed send leaves
the notification queued and displays a warning without undoing the status. The collected email
thanks the customer and encourages a Facebook review or an Instagram post, using the Facebook
and Instagram URLs in Site Settings. Configure those URLs before testing the review links.
All stage emails share the grouped item breakdown and divider placement from order views.

For unattended retries, configure a scheduler to call `GET /api/internal/order-emails` every minute
with `Authorization: Bearer <CRON_SECRET>` and set the matching server-only `CRON_SECRET`.
No scheduler or secret is provisioned automatically. The endpoint fails closed without it, processes
up to 50 queued records and returns 503 when a send fails. A later admin update also retries that
order's queued notifications. Customer/Stripe cancellations enter the same queue and are delivered
by the retry worker. Keep the worker running to handle those paths and interrupted requests.

Delivery is idempotent per status-history ID. The first rendered payload is stored and reused,
including if Resend accepts it but recording success fails. After 23 hours from payload creation,
automatic retries stop to avoid exceeding Resend's idempotency window. Inspect the private
`order_status_emails` rows and Resend logs, then reconcile delivery before retrying old records;
do not clear payloads or sent markers blindly. No customer email addresses or payloads are logged.

Configure `RESEND_API_KEY`, a verified sender address in `RESEND_FROM_EMAIL`, and `SITE_URL`.
The sender is `Papa's Tacos <RESEND_FROM_EMAIL>`; replies go to the saved Contact Email when valid.
The customer recipient comes from the immutable order email snapshot, not the webhook payload.
`SITE_URL` must be the public HTTPS origin in production. For local tests only, it falls back to
`STRIPE_FORWARD_ORIGIN` or `http://localhost:3000`; those links only work on the development machine.
The logo uses the existing public Supabase Storage logo, as in contact enquiries.

`order_confirmation_emails` stores one immutable email payload per order and its Resend ID and
acceptance time. These records are service-role-only; neither customer nor browser admin sessions
can read the recipient or HTML directly. Successful retries skip already-recorded deliveries.
Resend calls use the stable `order-confirmation/<order UUID>` idempotency key and stored payload,
including when sending succeeds but saving the result fails. `sent_at` means accepted by Resend,
not proof of inbox delivery; check Resend for bounces or spam filtering.

Sending failures return HTTP 500 to Stripe without undoing the recorded payment. Stripe retries
the webhook, or it can be resent from the Stripe Dashboard after configuration is corrected.
Resend retains idempotency keys for 24 hours. Uncertain deliveries older than 23 hours stop
automatic sends and log an order-ID-only reconciliation warning. Check Resend's email logs first:
if it was accepted, record its ID and acceptance timestamp using privileged SQL. If confirmed not
sent, send the stored payload deliberately and record the outcome. Do not delete/reset records
blindly, since that can send a duplicate. There is no separate scheduled email retry worker.

Automated email tests mock Resend and do not send real customer emails. Complete an authorized
test checkout with your own email after applying migration 030 to verify inbox delivery.

## Webhooks

Endpoint: `/api/stripe/webhook`.

Handled events: `checkout.session.completed`, `checkout.session.expired`, and `charge.refunded`. Signatures are verified against the raw request body before database access. Event recording and payment transitions are atomic and idempotent. Errors return HTTP 500 so Stripe can retry. Only events tagged for this application's integration are applied to orders.

For a deployed test environment, register its HTTPS endpoint in the Stripe test dashboard, subscribe to the three events above, and set that endpoint's signing secret. Set `SITE_URL` to the application's HTTPS origin. Do not use CLI forwarding for deployment.

## Verification

```sh
npm run test:payments
node --test --test-name-pattern="Stripe checkout|order confirmation delivery" tests/database.test.mjs
npm run typecheck
npx playwright test tests/browser/payments.spec.ts
```

Automated tests use local Postgres and Stripe mocks, not hosted customer records. Browser fixtures cover desktop/mobile forms, retry keys, receipt links and bag cleanup. A Stripe CLI test event has also been forwarded to the local webhook successfully (HTTP 200); a full application checkout still requires migration 029 and a configured test pickup event in hosted Supabase.