# Stage 2: authentication setup

## Implemented

- Next.js App Router, TypeScript, Tailwind CSS, official shadcn/ui components, local fonts, and a responsive brand shell.
- Supabase browser/server clients using the publishable key. The server client is marked `server-only`.
- Proxy-based session refresh, private/no-store responses, verified server identity, and database-backed admin checks.
- Google OAuth, password signup, password or magic-link sign-in, PKCE callback exchange, email-token verification, and expired-link recovery.
- `/account`: protected profile editing and local-session sign-out.
- `/admin`: protected administrator shell with the shadcn sidebar. Operational dashboard features are Stage 5.
- Safe local return paths so later checkout can resume after login without requiring an account when adding items to the bag.

No SQL changes were required for the original Stage 2. Apply Stage 1's scripts first if not already installed.
## Maintenance Access

Apply numbered SQL upgrades through
[028_remove_maintenance_allowlist.sql](../supabase/sql/028_remove_maintenance_allowlist.sql).
Upgrade 028 removes the old email allowlist and rebuilds `admin_business_settings` under the
same name used by the settings editor. The view checks the caller's admin role and respects
the underlying table's row-level security. It is repeatable and preserves all other settings.
Do not rerun upgrade 026 afterward, as it would recreate the obsolete allowlist.

`/sign-in` is the single sign-in URL and remains available during maintenance. Only users with
`profiles.role = 'admin'` can complete sign-in and browse the full site and dashboard while
maintenance is enabled. Email and Google callbacks sign out non-admins locally and return to
`/sign-in` with an administrator-only maintenance message. During maintenance, email-link requests
first check the submitted address against the Auth-synced `profiles.email` and admin role using
the server-only `SUPABASE_SECRET_KEY`. Non-admin and unknown addresses receive the restriction
message without an email being sent, including signup requests. Missing configuration or failed
lookups also prevent sending. This requires migration 027 and reveals maintenance eligibility
for the submitted address; normal sign-in responses remain generic when maintenance is off.
Never expose `SUPABASE_SECRET_KEY` in browser code or prefix it with `NEXT_PUBLIC_`.
The callback still rechecks the role after the link verifies the account. Existing customer sessions are
cleared when visiting `/sign-in`, allowing a different account to be used without a redirect loop.
If session clearing fails, sign-in returns a retryable error instead of redirecting repeatedly.
Other customer and signed-out page requests redirect to `/maintenance`, including `/admin`.
Normal customer sign-in resumes when maintenance is disabled. No email allowlist is needed.
Auth callbacks, API endpoints and static assets remain reachable; API authorization and database
RLS still apply. A missing or failed profile lookup never grants admin access.

Admin privileges must be provisioned explicitly in Supabase; Google sign-in and a matching email
do not grant them. See [First admin account](../supabase/README.md#first-admin-account).

## Environment

The app uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
An example without real credentials is in [../.env.example](../.env.example).

`SITE_URL` is the canonical application origin, without a path. It is optional for local
development: the app derives a localhost/127.0.0.1 origin and port from the current request.
It is required in production and must use HTTPS, for example `https://your-domain.example`.
Configure it for any non-local development URL too. Never derive a production callback origin
from an untrusted Host or forwarded header.

If you set `SITE_URL` locally, it must match the URL and port used in your browser.
Do not switch between localhost and 127.0.0.1 during an OAuth/PKCE login attempt.
Restart Next.js after changing environment variables.

## Supabase dashboard

A read-only check on 2026-09-15 found email auth and signup enabled. The owner subsequently
confirmed enabling Google and entering OAuth client credentials in Supabase. Live login completion,
SMTP, redirect allowlists and email templates still need the manual checks below.

### Redirect URLs

In **Authentication > URL Configuration**:

1. For local development set Site URL to `http://127.0.0.1:3000`.
2. Allow `http://127.0.0.1:3000/**` and, if used, `http://localhost:3000/**` as development redirect URLs.
3. If Next.js chooses a different port, add that exact local origin and use it consistently.
4. For deployment, change Site URL to your production HTTPS origin and set the application's `SITE_URL` to that same origin.
5. Allow production callbacks at `https://your-domain.example/auth/callback**` and `https://your-domain.example/auth/confirm**`. The suffix allows the `next` query string; do not wildcard the production hostname.

The callback validates `next` separately and never redirects to a supplied external origin.
`/auth/callback` handles Google/PKCE. `/auth/confirm` accepts PKCE codes and email token hashes.
Tokens and provider error descriptions are not reflected into the recovery page.

### Google sign-in

1. In Google Cloud Console, configure an OAuth consent screen and create a **Web application** OAuth client.
2. Add the callback URL shown in Supabase's Google provider panel, normally `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`, as the Google authorised redirect URI. This is different from the app callback URL.
3. If Google requests authorised JavaScript origins, add the app's local/production origins as appropriate.
4. In Supabase **Authentication > Sign In / Providers > Google**, enable Google and enter the client ID and secret directly in the dashboard.
5. If the Google consent screen is in testing mode, add the intended accounts as test users or complete Google's production publishing requirements.
6. Return to the app and choose **Continue with Google**.

Do not put the Google client secret in a public Next.js variable. The provider can create an
account on the first Google login; the database trigger still assigns only the customer role.

### Magic links and email delivery

The create-account tab collects a name, email and password (12–128 characters). In
**Authentication > Sign In / Providers > Email**, disable **Confirm email** to allow immediate
signup and checkout. Keep email signup enabled. This setting is required: application code does
not use an admin key to mark emails verified or to sign customers into existing accounts.
Supabase's normal signup API creates the customer and the profile trigger still assigns only
the customer role. If signup returns no session, the app shows an explicit recovery message
rather than pretending the customer is signed in.

Disabling confirmation means a new email address is not proof of mailbox ownership: customers
can mistype it or register somebody else's address. Confirm the address before payment and
do not treat new accounts as verified identities. Existing accounts cannot be accessed or
overwritten by submitting the signup form. They must use a password, Google or a magic link.
Consider retaining confirmation if verified mailbox ownership becomes a business requirement.

The sign-in tab defaults to single-use magic links and does not create unknown users.
Customers who registered with a password can select **Use a password instead**. Password
sign-in failures offer magic-link recovery; no password-reset flow is required to order.
Successful signup/password sign-in resumes the validated local `next` path, including checkout.
The magic-link request success response intentionally avoids revealing whether an account exists.

Default Supabase email templates work with the PKCE callback when the link is opened in
the same browser where the request began. For links that also work across devices, update
both **Magic Link** and **Confirm Signup** templates to use the token-hash flow:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">
  Sign in to Papa's Tacos
</a>
```

The application always provides `RedirectTo` as `/auth/confirm?next=...`, so the extra
parameters deliberately use `&amp;`. Do not replace the template with an unvalidated user URL.
Avoid email click-tracking that rewrites authentication URLs. `/auth/confirm` now displays a
**Continue Signing In** button on GET and verifies credentials only on a same-origin POST.
Ordinary scanners/preview requests can open that page without consuming the token. Tokens
are not rendered into the page and it is non-cacheable. The confirmation page uses
`Referrer-Policy: same-origin`: this preserves the Origin header for its same-origin form
submission while preventing referrer leakage to other origins. Using `no-referrer` on that
page makes browsers send `Origin: null` on POST, causing legitimate confirmations to fail.
Rejected submissions return to the normal sign-in recovery screen, preserving checkout.
**The direct token-hash template above is essential for scanner protection:** a default
`ConfirmationURL` can consume its one-time token at Supabase before reaching this page.
Google continues using the GET callback; it does not use this email interstitial.
Email hashes with types `email`, `signup` and `magiclink` are accepted; password recovery
and email-change tokens are not accepted as ordinary sign-in tokens.

Supabase's default email service has recipient and rate restrictions and is not suitable
for general customer delivery. Configure **Authentication > Email > SMTP Settings** with
a verified sending domain/provider before testing delivery to customers or going live.
Resend can be used as that SMTP provider, but having a `RESEND_API_KEY` in `.env.local`
does not configure Supabase's email service automatically. Enter SMTP credentials directly
in the Supabase dashboard, not in a browser form or chat.

For spam diagnosis, inspect a delivered message's **original headers** and the corresponding
Resend delivery event, rather than assuming rich HTML improves deliverability:

- Verify the exact sending domain in Resend and publish its required SPF and DKIM DNS records.
  Check `Authentication-Results` for SPF/DKIM passes and DMARC alignment with the visible From
  domain. Publish an appropriate DMARC policy; do not create duplicate SPF records.
- Confirm Supabase's custom SMTP is enabled and uses the verified Resend sender. Auth email
  delivery is separate from the application's Resend order-email integration.
- Disable open/click tracking for authentication emails, especially rewritten sign-in URLs.
- Check sender reputation, bounces, complaints and whether the message arrived before a newer
  requested link invalidated it. Use the newest link; never share the complete authentication URL.
- Avoid repeatedly sending test links to spam. Mark legitimate messages as not spam and allow
  time for a new sending domain to establish reputation. No provider guarantees inbox placement.

The repository cannot establish the cause of a specific rejected link or spam placement without
provider configuration and delivery evidence. Server logs record auth failure codes/statuses,
not passwords, addresses or tokens, to distinguish exchange failures from callback outages.

Review Supabase's auth rate limits. Enable its CAPTCHA protection before production if needed;
the matching client CAPTCHA flow must be added before switching that requirement on.
The app does not currently implement a distributed rate limiter or CAPTCHA widget.

## Admin access

Create the owner account through one of the login flows, then promote its profile using the
SQL in [the database guide](../supabase/README.md#first-admin-account).
The app queries the current `profiles.role` using the signed-in user's session, not a public
metadata field. The role is checked in both the admin layout and the page data access.
Customers get a not-found response for the admin area; anonymous visitors are sent to login.
Every future admin Server Action must also enforce `requireAdmin()` and RLS.

If a profile is missing or its query fails, the account page shows an unavailable state and
admin access stays denied. Do not work around this by exposing a privileged Supabase client.
The checked-in TypeScript database type currently covers the `profiles` table used in this stage;
generate full types from the installed schema when adding catalogue and order data access.

## Checks and limitations

```sh
npm run test:auth
npm run test:db
npm run lint
npm run typecheck
npm run build
```

With the dev server running, browser tests cover desktop, mobile, 320px layouts, menu keyboard
behaviour, sign-in tabs, browser validation, anonymous account/admin redirects, malformed return
URLs, and callback recovery. They do not send emails or create hosted Supabase users.

```sh
npx playwright install chromium
npm run test:browser
```

For another local port, set `PLAYWRIGHT_BASE_URL` to the running app's URL before the test command.
Tests save screenshots/traces under ignored `test-results/`.

Manually complete these live integration checks after configuring Supabase:

1. Disable Confirm email, create a customer with a password from checkout and verify immediate
   checkout return, a matching `profiles.id` and `role = customer`. Test duplicate-email signup
   does not sign into or modify the existing account.
2. Verify password and magic-link sign-in, including a used/expired link and a cross-device
   token-hash link. Preview/open the confirmation page twice before clicking Continue; it must
   not use the token until the button is submitted.
3. Sign in with Google, refresh `/account`, save profile details, and sign out.
4. Confirm a customer cannot access `/admin`; promote only the owner and verify the admin sidebar.
5. Test login started from `/sign-in?next=/account` and a refreshed/expired session.
6. Verify production HTTPS redirects, session cookies, SMTP delivery and rate limits in a staging environment.

Live OAuth completion, real email delivery, and authenticated browser sessions have not been
tested against the hosted project. No fake authentication bypass or test-user creation endpoint
is included in the application.

## Design assets and next stage

The taco photo is temporary development photography downloaded from
`https://images.unsplash.com/photo-1551504734-5ee1c4a1479b` and stored locally at
[../public/images/tacos.jpg](../public/images/tacos.jpg). It is not supplied client product photography;
confirm usage rights and replace it with approved Papa's Tacos assets before launch.
Fonts are bundled locally through Fontsource. No Google Fonts request is required at runtime.

Stage 3 adds the full landing page sections, menu, customisations, persistent anonymous bag,
testimonials/events pages, real social links, and image storage policies. Checkout and the
operational admin dashboard remain later stages. Do not enable live orders or payments yet.