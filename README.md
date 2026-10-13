# Fixora

A home-service management assignment built with Next.js App Router, TypeScript, Clerk, Drizzle, Supabase PostgreSQL/Realtime, Razorpay Test Mode, TanStack Query, Tailwind CSS, and shadcn/ui. The interface uses minimal layouts and selective neumorphic surfaces.

## Current milestone: live integration

The live application now uses authenticated PostgreSQL data rather than browser-local demo records. This remains an assignment/development build, **not a production-ready payment platform**.

### Implemented

- Clerk sign-in/sign-up and server-derived customer/provider/admin routing. Live mode has no role-preview selector or demo fallback.
- Public landing page at `/`, with service categories, booking steps, FAQs, and sign-in/sign-up links. Regular authentication opens the role-routed dashboard; provider registration opens dedicated onboarding.
- Role-scoped dashboards, catalog browsing, booking history, persistent notifications, and booking timelines.
- Customer profiles, saved addresses, edit/delete/default selection, booking creation, cancellation, and rescheduling.
- Provider applications, service/postal-code selection, administrator approval/rejection, and simple persisted clock-in / clock-out availability.
- Safe request previews, transactional acceptance/decline, first-acceptance-wins, and hybrid ASAP / scheduled appointments with duration-aware conflict protection.
- Inspection before work, itemized quotations, customer approval/rejection, later approved extras, and immutable booking snapshots.
- Administrator provider review, user suspension/restoration, current service-price/active-state editing, cancellation, and eligibility-checked reassignment of accepted jobs.
- Server-created Razorpay test orders, checkout signature verification, amount/currency/order/capture checks, and interrupted-checkout reconciliation.
- Signed, idempotent `payment.captured` webhook processing when a webhook secret is configured. **Without the secret the webhook route returns 503.** Checkout verification and manual reconciliation still work.
- One review per completed, paid booking; provider ratings are calculated from persisted reviews.
- Supabase subscriptions to authorized booking/invitation/notification changes. Subscriptions wait for Clerk and a fresh token, confirm Postgres readiness, refresh tokens, and recover on reconnection/tab return. During an outage, visible workspaces check automatically every 15 seconds.
- All 18 Drizzle tables, migrations, catalog-only seeding, Supabase RLS, append-only booking history, and snapshot-protection triggers.

### Verified and remaining validation

Migrations, catalog seeding, and security SQL have been applied to the configured development database. Automated tests exercise **real PostgreSQL concurrency and SQL RLS**, plus demo rules and payment-verification helpers. Temporary integration fixtures are cleaned up; they are not application demo seed data.

The Clerk sign-in page and unauthenticated API guards have been browser/HTTP checked. Clerk, Supabase publishable-key access, and Razorpay test credentials passed read-only checks. The **Realtime integration test uses actual Clerk development sessions**, verifies Supabase accepts their tokens, receives a provider's quotation-approval event, and confirms another customer cannot receive that booking's event. **A signed-in multi-account browser walkthrough and an actual Razorpay test checkout/webhook event still need to be verified with your accounts.** The separate SQL RLS tests set JWT claims within database transactions; only the Realtime test exercises external Clerk–Supabase authentication and event delivery.

General category creation/deletion, catalog expansion, cursor pagination, rate limiting, and production observability remain follow-up work. Refund automation, provider payouts, chat, maps, uploads, subscriptions, and tax invoices are outside the agreed first version.

## Run

Requires Node.js 22.13+ (Node 24 recommended) and npm.

```powershell
npm install
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)**. Use `localhost` consistently with Clerk during development. Switching between `127.0.0.1` and `localhost` changes the cookie origin and can trigger Clerk development handshake redirects.

The current local configuration sets `NEXT_PUBLIC_APP_MODE=live` in `.env.local`; credentials are read from `.env`. Application and database scripts load `.env.local` first, then `.env`, so local overrides take priority. Environment files are ignored by Git and secret values must never be committed.

To preview the original browser-local demo instead, set `NEXT_PUBLIC_APP_MODE=demo` in `.env.local` and restart. The demo needs no external credentials. Use its role selector to preview customer/provider/admin workflows; simulated payments are explicitly labelled.

## Database and authentication setup

Use a development Supabase project, not a database containing unrelated application data.

1. Configure variables from `.env.example` in `.env` or `.env.local`. Use a Supabase PostgreSQL connection string appropriate for your runtime; prepared statements are disabled for pooler compatibility.
2. Apply migrations, seed only the service catalog, and install Supabase security/publication settings:

   ```powershell
   npm run db:migrate
   npm run db:seed
   npm run db:security
   ```

   `db:security` applies `supabase/security.sql` transactionally. This depends on Supabase roles and `auth.jwt()`; it is not a generic PostgreSQL setup script. Rerun it after security-policy changes.

3. Configure a Clerk application with `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
4. **Enable the official Clerk–Supabase third-party authentication integration** in the Clerk and Supabase dashboards. Merely copying API keys does not enable it. Add the Clerk application as a trusted third-party auth provider in Supabase. The browser sends the normal Clerk session token, not a deprecated `supabase` JWT template. Subjects are textual `user_…` IDs, so SQL policies use `auth.jwt()->>'sub'`, not `auth.uid()`.
5. Set `NEXT_PUBLIC_APP_MODE=live`, restart, and sign in at `/sign-in`. A new account starts as a database `customer`. The dashboard loads real data, or a visible error; it never substitutes demo records.

### Live updates and troubleshooting

The dashboard banner says **“Live updates connected”** only after the Postgres subscription is ready. A quotation decision, booking change, or recipient notification invalidates the account's TanStack Query snapshot, fetching fresh authorized data without a page reload. Tokens are renewed every 45 seconds; returning to a visible tab or regaining network connectivity also renews authentication and refetches data. Unmounting a workspace removes its channels/listeners and ignores late callbacks.

If the connection is unavailable, the banner explicitly reports automatic **15-second checks** rather than claiming polling is Realtime. Expand **Connection details** to see a sanitized failure reason or use **Retry live connection**. JWT/permission errors require checking the Clerk integration and session's `role: authenticated` claim; network/service errors may be temporary. A healthy HTTP API does not alone prove that WebSockets are reachable from the browser. Never disable RLS or expose a secret/service-role key as a workaround.

### Provider account

Click **Become a provider** on the landing page, or visit `/become-a-provider`. If signed out, this opens `/sign-up?intent=provider`; an existing account can switch to `/sign-in?intent=provider` without losing the onboarding destination. After authentication, you go directly to a provider application page, **not the customer dashboard**.

Complete your name, ten-digit phone number, work description, years of experience, offered services, and six-digit service-area postal codes. Submission saves contact details and the provider application in one transaction, then opens the **pending provider dashboard**. After administrator approval, **clock in** to see and accept matching requests. Provider intent is only navigation; neither a query parameter nor clicking the button grants approval or administrator access.

Returning providers go directly to `/provider`, and administrator accounts return to `/admin` rather than entering provider onboarding. Eligible existing customers can still apply from **Settings**. Existing customer booking history prevents conversion; use a separate account. Use separate Clerk accounts for each role during testing. Database identities still start with the safe `customer` role internally until the validated application is submitted; this does not require visiting or using the customer workspace.

Changing an approved provider's service list or postal-code coverage requires approval again and clocks the provider out. Editing biography/experience alone preserves approval. Suspending a provider also clocks them out; restoration does not automatically clock them back in. Existing assigned jobs remain when the provider clocks out.

### Clock-in / clock-out availability

`/provider/availability` now contains a **Clock in / Clock out** control, also available on the provider overview and live request screen. The weekly grid and date-specific overrides are removed. Migration `0003_worried_mentallo.sql` starts existing providers **clocked out**; each approved provider must explicitly clock in.

- Clocked-in, approved, non-suspended providers see all eligible **unassigned** requests in their offered services and postal-code coverage, including requests created while offline. There is no longer a three-provider dispatch limit. Lists retain the workspace's 200-record cap.
- Clocked-out providers cannot see or accept new requests through the application/API. Their accepted jobs, quotation decisions, progress, and payments remain available. Clock changes are persisted and timestamped in `Asia/Kolkata` in the UI; other tabs update through recipient notifications.
- Customers choose **As soon as possible** or a **scheduled preferred arrival**. Clocking in expresses readiness to **accept** work; it does not guarantee every future appointment. Acceptance rechecks approval, clock state, coverage, visit duration, travel buffer, and conflicts under database locks. First eligible acceptance wins.
- Unassigned request previews contain service, city/postal code, booked time, and saved fee only. Exact addresses, names, and private problem descriptions stay restricted until assignment. A declined request stays hidden from that provider unless the customer reschedules it.
- Request creation, assignment, cancellation, and rescheduling notify relevant clocked-in providers so their lists refresh through Realtime, including providers who discovered older requests after clocking in.
- Clock status is manual: closing the browser does **not** clock out. This is not an attendance/payroll timesheet or browser-presence tracker.
- Old `provider_availability` rows/table are retained, unused, to avoid destroying previous data. Neither matching nor workspace responses read them. Old `schedule` / `availability` mutations are rejected; use `{ "type": "clock", "clockedIn": true }` or `false` instead.

### Hybrid booking timing

- New booking and rescheduling forms offer **As soon as possible** or **Schedule a visit**. Scheduled arrivals use 30-minute increments in `Asia/Kolkata`; this is preferred arrival, not a guaranteed finish time. Open requests can switch modes without changing their visit fee or address snapshot.
- ASAP needs no customer-chosen date/time. On acceptance, providers choose an arrival estimate of **15, 30, 60, or 120 minutes**. That timestamp is saved and shown in customer booking details/history and the confirmation notification. Unaccepted ASAP requests stay open until accepted or cancelled; they do not silently expire at a fixed slot boundary.
- Providers select an estimated visit duration of **1, 2, 3, 4, or 8 hours** when accepting. The reservation adds **30 minutes of travel buffer**. New requests default to a one-hour visit; legacy windows retain two hours. This is a visit estimate, not a price or permission to start unapproved work.
- Matching clocked-in providers see **all matching open previews**, including **Available to accept**, **Conflicts with another appointment**, **Busy — finish your current visit first**, and **Arrival time has passed — customer must reschedule**. Unavailable acceptance is disabled and independently rejected by the server. Providers can still decline those requests. Lists retain the 200-record cap.
- Clock status and busy status are separate. An accepted ASAP request immediately marks its provider busy; travel, inspection, quotation approval, and work also remain busy until closure. A busy provider can accept a non-overlapping future appointment but cannot accept another ASAP visit or start a second simultaneous visit.
- **Completed work, closed inspections, and cancellations free capacity immediately, independently of payment.** Unpaid completed bills do not reserve the old slot. Active visits that overrun remain busy; projected conflict checks conservatively extend their expected occupied time. Already-confirmed later visits may need operational coordination if work overruns; no automatic rescheduling or multi-day project/resource calendar is implemented.
- Migrations `0004_sweet_edwin_jarvis.sql` and `0005_nebulous_hairball.sql` preserve existing dates, slot labels, and payment rules while backfilling saved arrival/reservation timestamps. The old permanent provider-slot unique index is replaced by a PostgreSQL **GiST exclusion constraint** for overlapping live reservations and a partial unique index for one active/immediate visit. `btree_gist` must be available to apply the migration. These database constraints supplement provider row locks.
- Appointment snapshots become immutable after assignment. Existing legacy APIs still accept `date` + `slot` when no `scheduleMode` is supplied; new clients should send the hybrid fields below. The internal legacy `slot` column is retained for compatibility, not as a quota for new appointments.

### First administrator

There is deliberately no public admin sign-up or client-selected admin role.

1. Sign in once with a dedicated account that has no customer/provider booking history.
2. Find that account's Clerk `user_…` ID in your Clerk dashboard.
3. From the trusted project terminal, run:

   ```powershell
   npm run admin:grant -- user_YOUR_CLERK_ID --confirm
   ```

4. Sign out and sign back in. `/customer` redirects to `/admin` because the server uses the database role.

The script refuses suspended accounts, provider accounts, and accounts with booking history. It does not auto-promote the first registrant.

## Razorpay Test Mode

Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` using **test keys**. Keys not beginning with `rzp_test_` are rejected; this assignment cannot collect real-money payments.

1. Close a booking by completing approved work, or by declining the initial quotation after inspection. Resolve any pending extra-work estimate before completing work.
2. Customer opens the completed booking and selects **Pay with Razorpay → Open test checkout**.
3. Use Razorpay's official test payment details. The server verifies checkout HMAC, retrieves payment details from Razorpay, and records payment only when the exact order/amount/currency is **captured**.
4. If payment is authorized but not captured, or checkout closes before confirmation, use **Check payment status**. The server reads the stored order's gateway payments; browser claims alone never mark a booking paid.

For webhook delivery, add a server-only `RAZORPAY_WEBHOOK_SECRET` and configure `payment.captured` to a publicly reachable HTTPS endpoint:

```text
https://YOUR_APP_HOST/api/webhooks/razorpay
```

The route verifies the unmodified raw request body against `x-razorpay-signature`, deduplicates `x-razorpay-event-id`, and records capture idempotently. Without the secret it stays disabled. Never expose the secret through a `NEXT_PUBLIC_` variable. Localhost is not reachable from Razorpay; use a development tunnel or deployed test environment for actual delivery.

An existing open order is reused, and booking locks prevent concurrent local order creation. A rare gateway-success/database-failure boundary can leave an orphan gateway order; receipt-based operational reconciliation is follow-up work. No automated refunds or payouts are implemented.

### Single-payment visit-fee rule

For **new bookings**, the catalog price is the **visit / inspection fee**, not a full-job price. Nothing is collected at booking or quotation approval.

```text
requested → accepted → on_the_way → inspecting → awaiting_approval
                                                    ├─ approve → ready_to_start → in_progress → completed
                                                    │                                         └─ pay visit fee + approved labour/materials once
                                                    └─ decline → inspection_completed
                                                                  └─ pay only the visit fee once
```

- Only the assigned provider can record arrival, inspect, and submit the quotation. Only the owning customer can approve or decline it. Providers cannot skip approval or directly mark an inspection completed.
- Initial quotation items contain **additional labour and materials only**. The total shown to the customer includes the immutable booked visit fee exactly once. A quotation with no extra items is allowed and still needs approval.
- Declining the initial quotation closes the inspection as **“Inspection completed — work declined”**. It does not count as completed work or unlock a completed-job review. No proposed labour/material charges are added.
- Later estimates during approved work are **incremental extra work**, not replacement quotations. Rejecting those extras retains the original agreed job and total. Pending extras must be resolved before completion.
- Payment orders/captures are accepted only for `completed` or `inspection_completed` bookings. Open orders are reused and captured payments are unique per booking. Closed totals/outcomes and the booking's payment rule cannot be changed.
- A booking without arrival/inspection cannot become payable; cancel an unfulfilled visit without collecting a fee. Administrators retain existing cancellation powers for exceptional cases, but cannot cancel an already-closed payable booking.
- Migration `0002_exotic_nomad.sql` preserves every existing booking as `payment_rule = 1` (original base-price terms). New bookings default to `payment_rule = 2`. Older stored/demo examples retain their original terms as well; create a new booking to test this workflow.

Example: booked visit fee ₹100 + approved labour/materials ₹900 = **one ₹1,000 payment after completed work**. Decline that inspection quotation instead = **one ₹100 payment**. Catalog fees are administrator-managed; this feature does not change their current amounts or add provider payouts.

## Live API

All authenticated routes require live mode, configured Clerk/database credentials, an authenticated non-suspended account, and server authorization. Browser mutations require a matching `Origin` header. Demo mode returns `503` and never writes demo identities to PostgreSQL. The webhook uses a signature instead of a browser session/Origin.

| Endpoint | Actions |
|---|---|
| `GET /api/session` | Own profile; register a new customer if necessary |
| `GET /api/workspace` | Role-scoped, consistent dashboard snapshot |
| `POST /api/actions` | Validated workspace commands; authorization is independent of client inputs |
| `GET /api/services` | Active service/category catalog |
| `GET, POST /api/addresses` | Own addresses; create an address |
| `GET, POST /api/bookings` | Own/assigned bookings or admin list; customer creation |
| `PATCH /api/bookings/:id` | Accept, decline, progress, cancel, reschedule |
| `GET /api/requests` | Own invitations, safe summaries, no exact address |
| `GET, PATCH /api/notifications` | Own notifications and read state |
| `POST /api/payments/orders` | Create/reuse a test order for owned completed work or a declined inspection quotation |
| `POST /api/payments/verify` | Verify checkout signature and gateway capture |
| `POST /api/webhooks/razorpay` | Signed capture events; disabled without the secret |

Workspace commands include `book`, `accept`, `decline`, `progress`, `cancel`, `reschedule`, `estimate`, `decide-estimate`, `review`, `pay` (reconciliation, **not simulated payment**), `address`, `delete-address`, `default-address`, `profile`, `provider-profile`, `clock`, `provider-status`, `service`, `suspend`, `reassign`, and `read`.

Booking creation via `/api/bookings` requires a UUID `Idempotency-Key` header. `/api/actions` uses `requestKey` in the `book` body. The booking wizard retains one key across retries. Reuse a key only for the same payload.

```json
{
  "type": "book",
  "requestKey": "<UUID>",
  "serviceId": "<service UUID>",
  "addressId": "<own address UUID>",
  "scheduleMode": "scheduled",
  "date": "2026-12-15",
  "preferredTime": "10:30",
  "description": "The kitchen tap is leaking. Please inspect the washer."
}
```

For ASAP, send `"scheduleMode": "asap"` and omit `date`, `slot`, and `preferredTime`. Provider acceptance can include `"arrivalMinutes": 30` (ASAP only) and `"visitMinutes": 60`; only the listed estimate choices are accepted. Rescheduling uses `type: "reschedule"`, `bookingId`, and the same timing fields.

Growing workspace lists use **server-side pagination**: bookings/jobs, notifications, matching service requests, admin providers/accounts, captured payments, unpaid visits, reviews, and visits awaiting a review. Pages default to **10 records**, with **20** and **50** available. Search and booking-status filters apply before pagination; dashboard totals and unread badges count the full authorized history. Services and saved addresses remain unpaged. Overview cards show a short preview with links to the complete lists.

Page state lives in the URL (`page`, `pageSize`; `pendingPage` independently pages unpaid visits or review opportunities). Changing booking filters or page size resets pagination. Out-of-range pages clamp to the last available page, including after records disappear. Booking details load separately by authorized ID, so older notifications/history still work without their booking being on the current page. Realtime and mutations invalidate all affected page caches.

`GET /api/workspace?section=bookings&page=2&pageSize=20&status=completed&q=tap` returns the workspace plus `pages` metadata and full-history `stats`. `GET /api/bookings`, `/api/notifications`, and `/api/requests` accept pagination parameters and return `{ items, pagination }` (notifications also return `unread`). All lists and counts remain account/role-scoped. Pagination uses deterministic ordering and PostgreSQL `LIMIT/OFFSET`; deep-offset performance may eventually justify cursor pagination. Current profile email is the registration snapshot; Clerk identity changes are managed independently.

## Security and state

- Database roles are authoritative; never accept roles from user-editable Clerk metadata.
- Privileged Drizzle connections can bypass RLS. Server-side authentication, suspension, role, and ownership checks remain mandatory.
- Browser Supabase clients get only authorized SELECT access; writes go through server routes. Unassigned providers see invitation previews, not customer addresses or private issue descriptions.
- Never expose `DATABASE_URL`, Clerk/Razorpay secrets, or Supabase secret/service-role keys. The browser uses only the Supabase **publishable** key plus its Clerk token.
- TanStack Query manages server data and invalidation; local React state manages forms/dialogs; URL parameters manage booking filters; Clerk manages sessions. No Redux/Zustand.
- Demo storage remains isolated in `src/lib/demo/`; it is not the live database.

## Checks

```powershell
npm test
npm run test:landing
npm run test:db
npm run test:realtime
npm run typecheck
npm run lint
npm run build
npm audit --omit=dev
```

`npm test` covers pagination validation, page boundaries/links, demo list filtering and totals, independent payment/review pages, accessible controls, hybrid timing/availability/UI, demo business rules, single-payment visit-fee outcomes, quotation approval gates, and pure HMAC/capture checks. `test:landing` checks public landing access, hybrid-booking/payment-policy copy, and provider authentication intent; run the app first (defaults to `http://localhost:3000`, overridden with `FIXORA_TEST_BASE_URL`). `test:db` uses the configured **development database**, inserts uniquely scoped temporary fixtures, and checks pagination beyond 200 records, deterministic ordering, filtered counts, authorized details, concurrent acceptance/booking idempotency, ASAP ETA/busy rules, overlapping/adjacent appointments, SQL overlap enforcement, capacity release before payment, visible expired requests and hybrid rescheduling, duplicate capture/review protection, estimates, visit-only payment after rejection, no-arrival payment denial, frozen closed bills, legacy terms, onboarding, suspension, reassignment, clock-in/out, immutable snapshots/history, and SQL RLS. Cleanup temporarily disables triggers **only within its own connection/transaction**, deleting only that run's fixture IDs. It needs a privileged development connection and does not call the real payment gateway. Do not run it against production.

`test:realtime` requires the configured development database, Clerk **test** secret key, Supabase URL, and publishable key. It creates three temporary Clerk users/sessions and matching isolated database fixtures, then tests the same subscription helper used by the dashboard: quotation decisions, ASAP request discovery, clock-in/out, capacity release after unpaid completion, and ASAP acceptance/ETA. Another customer must not receive the provider's events. Supabase must trust the Clerk issuer and the session token must carry `role: authenticated`. All of that run's database fixtures and Clerk users are deleted afterward; it never signs in as or modifies an existing user's account. Do not target a production database.

The complete dependency audit previously reported development-tooling advisories in Drizzle Kit/esbuild and ESLint glob dependencies. Do not apply incompatible forced downgrades using `npm audit fix --force`.

## Main files

```text
src/app/                 Pages and authenticated Route Handlers
src/components/          Shell, dashboards, live/demo panels, booking dialogs
src/components/ui/       Generated shadcn/ui components (Base UI primitives)
src/lib/server/          Authentication, scoped queries, transactions, payments
src/lib/demo/            Explicit browser-local demo seed/store/workflows
src/db/                  Drizzle schema, database client, catalog seed
drizzle/                 Generated database migrations
supabase/security.sql    RLS, Realtime publication, immutable history/snapshots
scripts/                 Security setup and explicit administrator bootstrap
tests/                   Unit and development-database integration checks
```
