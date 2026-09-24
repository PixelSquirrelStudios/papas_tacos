# Stage 3: public website and bag

## Install the database now

Before populating content or testing account profiles, use Supabase **SQL Editor** to run
the existing scripts in `supabase/sql/`, from `000_helpers.sql` through
`017_order_operations.sql`, separately and in order. See the full linked list and first-admin
instructions in [../supabase/README.md](../supabase/README.md).

Run initial-install scripts only once. If some have already succeeded, continue from the
next unapplied file. Stop on an error; do not drop tables or rerun earlier successful scripts.
The application does not apply SQL automatically. No hosted schema changes were made during this stage.

After the table scripts succeed, run [../supabase/storage/001_public_media.sql](../supabase/storage/001_public_media.sql)
once in SQL Editor. It creates the `public-media` bucket and object policies, not an additional
application table. The original one-file-per-table structure is unchanged.

## Public content

For the client's supplied menu, run the separate
[client menu seed](../supabase/seeds/001_client_menu.sql) after the table installation.
Read its [review and publication checklist](../supabase/seeds/README.md) first:
churro prices and savoury sauce choices are missing, and allergens need confirmation.
The seed does not create any new tables or overwrite later menu edits.

While admin editing is still a later stage, use the Supabase Table Editor to enter approved content:

1. Create a `menu_categories` row and set `is_published = true`.
2. Create `menu_items` linked to that category. Prices are integer pence: 850 means GBP 8.50.
3. Set `is_published = true`, use `is_available` for sold-out status, and set `is_featured` for the homepage.
4. Enter verified allergens/dietary labels. Empty allergen lists are not presented as an allergen-free guarantee.
5. For customisations, create published `modifier_groups`, their `modifier_options`, then connect them using `menu_item_modifier_groups`.
6. A group's `min_selections` makes choices required; `max_selections` limits choices. Optional extras should use `min_selections = 0`. Each option can be selected once per item unit; quantities apply to the complete customised item.
7. Publish genuine testimonials; mark selected ones `is_featured`. No sample customer endorsements are inserted.
8. Publish events with trading dates/times, location, description and optional image. The homepage selects the earliest-starting event that has not ended, including an event currently in progress.
9. Set contact details and actual HTTPS social URLs in the singleton `business_settings` row. Unconfigured social links are omitted, not fabricated.

Use Table Editor's UUID values for foreign keys. A published item in an unpublished category
does not appear. Archive referenced menu items rather than deleting them.
Public reads use only the anonymous publishable key, even for a signed-in admin; draft content
is not exposed through the public menu. Failed queries render unavailable states, while a
successful empty query renders an empty state. Do not use a privileged secret key to bypass RLS.

## Menu Description Formatting

Admin menu descriptions use TinyMCE 8.9.1 with `licenseKey="gpl"`, loaded from
`https://cdn.jsdelivr.net/npm/tinymce@8.9.1/tinymce.min.js`. This is the GPL build
distributed through a public CDN, not the Tiny Cloud subscription service. No API key
is required. The application must comply with TinyMCE's GPLv2+ terms; this configuration
does not change the project's licence. Review licence compatibility before distribution.
See [TinyMCE licensing](https://www.tiny.cloud/docs/tinymce/latest/license-key/).

The light-mode editor toolbar supports paragraphs, bold, italic, underline and lists.
Only menu item descriptions use the rich editor; event/category descriptions remain plain text.
Existing plain-text descriptions retain their paragraph breaks. No SQL migration is needed:
sanitised HTML uses the existing `menu_items.description` column and its 10,000-character limit.
The server save schema and all menu HTML renderers allowlist formatting and remove scripts,
embedded media, event handlers and unsafe links. Menu search uses readable text, not markup.

The CDN must be reachable by the admin browser. A load failure preserves the description
in a textarea rather than clearing it. Keep the CDN version and the development `tinymce`
package aligned when upgrading; browser tests serve those local assets in place of the CDN.

## Images

Upload approved JPG, PNG, WebP or AVIF files to the `public-media` bucket, maximum 5 MB each.
Use paths such as `menu/chicken-tacos.webp` and `events/autumn-market.jpg` with lowercase extensions.
Put the bucket-relative path in `menu_items.image_path` or `events.featured_image_path`.
Add meaningful `image_alt` text. Do not put the full Supabase URL or bucket name in the path field.
For temporary stock photography only, full HTTPS URLs on `images.unsplash.com` with
a `/photo-*` path are also supported. Other remote hosts, credentials and non-HTTPS URLs
are rejected. Replace these placeholders with approved client photos before launch.

This bucket is deliberately public. Anyone with an image URL can view it, including images
attached to unpublished content. Store only publishable business imagery here, never customer
information or private documents. Browser uploads/updates/deletes are admin-only; the admin upload
UI arrives in Stage 5. Supabase's Storage service enforces the size/MIME limits; local SQL tests
cover policies and bucket configuration but do not replace live upload testing.

For cache-friendly image updates, use a new filename and update the content row. Missing images
display an honest image-unavailable placeholder. The homepage hero still uses development
photography and must be replaced with approved client imagery before launch.

## About and Event Enquiries

Apply `supabase/sql/021_business_settings_about.sql` once after upgrade 020, followed by
`supabase/sql/022_business_settings_about_full_story.sql`. Then use **Admin > Site Settings** to edit
the About eyebrow, heading, short homepage content, rich full story, featured image and image description.
The homepage uses the short content while `/about` uses the TinyMCE-authored full story. Upload About
imagery through that form; it uses the existing public media bucket under `about/`.

Apply `supabase/sql/024_business_settings_about_page_images.sql` after 023 to enable up to three optional
story images used only by `/about`. Upload and describe each image separately in **Admin > Site Settings**;
these do not replace or alter the homepage featured image.

The homepage event enquiry form sends through Resend. Configure these server-only deployment values:

```env
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=bookings@your-verified-domain.example
BOOKING_ENQUIRY_TO=events@your-business.example
```

`RESEND_FROM_EMAIL` must belong to a domain verified in Resend. `BOOKING_ENQUIRY_TO` is optional when
the Site Settings contact email is configured; the explicit variable takes precedence. `SITE_URL`
must be the site's canonical HTTPS origin so cross-origin submissions are rejected. Never expose the
Resend API key through a `NEXT_PUBLIC_` variable.

The business receives a branded HTML and plain-text email with the customer's contact and event
details. The customer's email is set as Reply-To. The form does not confirm a booking. Before launch,
send one real enquiry from the deployed site and verify delivery, Reply-To, mobile email rendering,
and the configured destination inbox. Automated tests mock Resend and send no live email.

## Bag behaviour

- `/menu` supports category, dietary and text filters; required choices, optional extras, allergen details, quantity controls and sold-out states.
- `/bag` supports item editing/removal, quantity changes, and clearly separated item/extras, service fee and packaging amounts.
- Only item IDs, option IDs and quantities persist in browser local storage. No email, phone, tokens, customer profile data or trusted prices are stored in the bag.
- Matching customisations merge; different choices remain separate lines. Quantities are capped at 99 and the bag at 100 distinct lines.
- Saved prices are recalculated from the current catalogue. Removed/sold-out items and extras are flagged; editing removes unavailable extras for the customer to review.
- The catalogue refreshes on mount, window focus and every minute. If it cannot be fetched, the bag retains its saved IDs rather than discarding purchases. Prices remain estimates until the server-authoritative checkout transaction.
- The bag survives refreshes and navigation to login. It belongs to this browser, not a synced account, and is retained on sign-out. Shared-device users can remove their bag items explicitly.
- Local-storage-disabled browsers show a warning with a populated bag; items remain in memory for the current page session.
- Stripe test-mode card checkout and Resend pickup confirmations are available after [payment setup](STRIPE_SETUP.md), migrations 029-030 and enabling Card Payments. Closed ordering, maintenance and invalid bags prevent checkout. Live payments are not enabled.

Event availability labels account for the global open/paused/closed status, event pickup toggle,
event status and ordering window. They do not reserve a slot or imply capacity remains. Times
display in Europe/London, including daylight saving. The database remains the final authority
at checkout.

## Verification

```sh
npm run test:bag
npm run test:db
npm run test:auth
npm run typecheck
npm run lint
npm run build
```

With the local dev server running:

```sh
npm run test:browser
```

Browser tests intercept `/api/catalogue` and `/api/contact` to supply local test fixtures. They cover
customisation, extra pricing, bag estimates, editing, reload persistence, navigation to login,
unavailable extras, sold-out changes, filters and narrow layouts. They do not insert hosted content,
create users, send email or place orders. Unit tests cover event status precedence and London time;
database tests cover admin-only image writes. Production Storage, real client content, live OAuth,
email delivery and payment integration still need their respective integration checks.

## Next stage

Stripe test-mode pickup checkout, server-priced reservations, webhook processing, order tracking,
PDF receipts and branded pickup-confirmation emails are implemented. See [payment setup](STRIPE_SETUP.md).
Cash checkout, ready-for-pickup notifications and production payment rollout remain separate work.