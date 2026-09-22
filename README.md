# Papa's Tacos

Mobile-first Next.js food-truck website and pickup ordering application for a UK business.

## Current stage: public website and bag

Stage 1 provides 16 application tables, one SQL file per table, row-level security,
automatic customer profiles, event/global ordering controls, pickup guards,
audited admin order operations, and executable PostgreSQL tests.

Stage 2 adds Next.js, TypeScript, Tailwind, shadcn/ui, a branded responsive shell,
Supabase SSR authentication, Google/magic-link flows, protected profile editing,
logout, and an admin-only sidebar shell.

Stage 3 adds database-backed homepage sections, menu filtering/customisations, an anonymous
persistent bag with fee estimates, testimonials, event listings/details and public image Storage policies.
Checkout and operational admin CRUD are not built yet.

Read [the Supabase setup guide](supabase/README.md) before running SQL.
Your existing `.env.local` is unchanged and excluded from version control.
Read [the Stage 2 auth setup guide](docs/AUTH_SETUP.md) for Supabase redirects, Google login,
SMTP, email templates, and first-admin setup. No additional Stage 2 SQL is required.
The app uses your Supabase publishable key; no hosted schema or provider settings were changed.
**Apply the table SQL now if not already done**, then apply the Stage 3 Storage script.
See [the catalogue setup guide](docs/CATALOGUE_SETUP.md) for exact ordering and how to publish content.

## Run locally

Use Node.js 22.18+ or a newer LTS release:

```sh
npm install
npm run dev
```

Open the local URL printed by Next.js, normally `http://localhost:3000`.
Keep that origin consistent throughout login. Production requires an HTTPS `SITE_URL`.

## Local verification

With a current Node.js LTS release and npm installed:

```sh
npm install
npm run test:auth
npm run test:bag
npm run test:db
npm run lint
npm run typecheck
npm run build
```

Database tests run real PostgreSQL SQL through PGlite in isolated local databases.
Supabase auth roles, `auth.users`, `auth.uid()`, and default grants are emulated.
No environment credentials, network database connections, or Docker are required for those tests.
With the development server running, `npm run test:browser` checks the public/auth flows on desktop
and mobile without sending emails or creating hosted users. Install Chromium once with
`npx playwright install chromium`. Live Google and email login still require dashboard setup and manual verification.

## Agreed ordering behaviour

- Customers can browse and build their bag without signing in. An account is required at checkout.
- Each event has an independent pickup toggle and an open/paused/closed ordering status.
- The business also has a global open/paused/closed status that overrides all events.
- Publishing an event does not automatically enable pickup orders.
- Pausing or closing orders does not cancel or hide existing orders.
- An order also needs an enabled future pickup slot with capacity and sufficient preparation time.
- Monetary amounts are integer pence in GBP; event timestamps include timezone information.

## Next stages, one at a time

1. **Database foundation (implemented):** SQL files, access policies, operational controls, and local tests.
2. **Next.js foundation and auth (implemented, live provider verification pending):** App Router, TypeScript, Tailwind, shadcn/ui, Supabase SSR clients, Google/magic-link login, protected routes, and visual shell.
3. **Public website and bag (implemented, hosted content setup pending):** branded landing page, menu/customisations, testimonials, events, socials, responsive navigation, persistent anonymous bag, and image storage policies.
4. **Checkout and customer orders:** server-priced atomic checkout, pickup selection, fees, Stripe/cash flows, webhooks, reservation expiry, customer order tracking, and email notifications.
5. **Admin dashboard:** shadcn sidebar, content CRUD, images, global/event ordering controls, pickup slots, order queue, and customer-visible status updates.
6. **Launch preparation:** integration/security tests, mobile/browser checks, accessibility, SEO, business policies, production configuration, and deployment.

Later stages will add incremental SQL as their workflows require it; do not reapply the initial scripts to upgrade an existing database.

## Pending business decisions

Trading locations and pickup schedule, actual menu/allergens, branding and photography,
VAT treatment, fees, cancellation/refund rules, and notification provider still need confirmation.
The schema starts with ordering closed, no additional fees, cash enabled, and card payments disabled.
No fabricated reviews or public sample business content are seeded.
