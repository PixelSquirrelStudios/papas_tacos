# Stripe Test Payments

## Setup

1. Apply [029_stripe_checkout.sql](../supabase/sql/029_stripe_checkout.sql) in Supabase SQL Editor after migrations 000-028, then [030_order_confirmation_emails.sql](../supabase/sql/030_order_confirmation_emails.sql). These add atomic checkout and private confirmation-email delivery records. Both are repeatable. Do not enable checkout before applying them.
2. Keep `STRIPE_SECRET_KEY` set to a Stripe `sk_test_` key and `SUPABASE_SECRET_KEY` server-only. This implementation deliberately refuses live Stripe keys. Hosted Checkout does not need the publishable key in the browser.
3. Run `npm run dev`, then `npm run stripe:listen` in a second terminal. The listener uses the Stripe CLI, reads the test key from the local environment, and saves `STRIPE_WEBHOOK_SECRET` without printing it. Keep it running while testing. Restart Next.js if it does not reload the environment change.
4. In Site Settings, enable Card Payments, set ordering to Open, and disable Maintenance Mode. Publish an event with pickup enabled and ordering open, plus enabled future pickup slots. The selected slot must allow at least 32 minutes for payment plus the event's preparation lead time.
5. Sign in, add available menu items, open `/checkout`, select pickup/contact details, and pay on Stripe's hosted page.

The portable CLI is installed locally at `%LOCALAPPDATA%\StripeCLI\stripe.exe` on this development machine. Elsewhere, install the official [Stripe CLI](https://docs.stripe.com/stripe-cli). Set `STRIPE_CLI_PATH` if it is not on PATH. Set `STRIPE_FORWARD_ORIGIN=http://localhost:3001` when the app uses another port. Local forwarding uses the CLI's connection to Stripe; no application WebSocket endpoint is required.

Never commit environment files or expose secret keys as `NEXT_PUBLIC_*` variables. The local CLI signing secret is not the secret for a deployed webhook endpoint.

## Test Cards

Use `4242 4242 4242 4242`, any future expiry and any three-digit CVC for a successful test payment. Stripe's `4000 0000 0000 9995` card tests insufficient funds. No real money is charged with test keys.

The account return page may briefly show Awaiting Payment. It refreshes automatically; only the verified webhook can mark an order paid. Stripe's redirect query is never proof of payment.

## Orders and Receipts

- Checkout requires a signed-in account. The database calculates current item/choice prices, validates required choices and availability, locks pickup capacity, and stores immutable order snapshots in one transaction. Client totals are comparison values, not trusted prices.
- Retrying unchanged checkout details uses the same checkout key and Stripe idempotency key. Each customer can have at most three pending checkouts. A changed bag/contact selection starts a distinct attempt; cancel unused attempts in Account > Orders.
- Reservations last at most one hour and never beyond pickup preparation time. Capacity is retained until a signed expiry event or explicit cancellation, even if the local timestamp passes. This avoids overselling when webhooks are delayed. Keep the listener running.
- A session-creation failure can leave an unpaid reservation. Retry the unchanged checkout or cancel it from Account > Orders. There is no background reconciliation worker yet; monitor missed webhook deliveries before production launch.
- Account > Orders > View Order offers View Receipt and Download Receipt after confirmed payment. PDFs are generated from the customer's order/payment snapshots, protected by ownership checks, and never publicly cached. Refunded amounts are reflected. They are payment receipts, not VAT invoices.
- Confirmed payment clears only the matching purchased bag. Items added or changed in the meantime are preserved. Retry information is stored in browser session storage and removed after confirmation; it includes checkout contact fields and is not a synced account record.
- Customers can cancel pending checkouts. A payment racing with cancellation never revives the order: it triggers an idempotent full Stripe refund. Refunds initiated in the Stripe Dashboard update order/payment status through `charge.refunded`. Cancelling an already-paid order in admin does not automatically refund it; issue the refund in Stripe.
- Cash collection for existing cash orders remains available in admin, but this new customer checkout is card-only. No customer cash-checkout flow, tax calculation, or production-key support is added here.

## Pickup Confirmation Emails

After a verified Stripe card payment is recorded, Resend sends the customer a branded HTML and
plain-text confirmation. It includes a prominent order number to show staff, the Europe/London
pickup window and location, items and choices, fees, total paid, and a link to the signed-in order
page with receipt downloads. It confirms the order, not that food is already ready for collection.
Cancelled, unpaid and refunded orders do not receive new confirmations. Cash-payment and
ready-for-pickup notification emails are not part of this flow.

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