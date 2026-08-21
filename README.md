# Arena Hotel System

Version 1 establishes the application foundation for 3dHotels:

- Next.js App Router, React and TypeScript frontend
- Supabase Auth login for the hotel owner
- Server-side dashboard access checks against `public.staff_profiles`
- Version-controlled Supabase database migrations
- Core hotel operations dashboard for occupancy, arrivals, departures, rooms and housekeeping
- Database-level double-booking prevention for inventory-holding reservations

## Architecture Decision

The project uses Next.js because the planned integrations need secure server-side execution:

- Paystack transaction initialization and verification with secret keys
- Paystack webhooks
- Meta WhatsApp Cloud API webhooks
- Transactional hotel booking operations

Browser code must only receive public values such as the Supabase URL and publishable key. Paystack secret-key operations and trusted webhook fulfillment run only in server-side route handlers/server actions. The separate Supabase admin credential is isolated in a server-only client and is not used for normal dashboard, booking, room, reservation, or staff operations.

## Environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: your Supabase publishable key

Paystack online payments require server-only `PAYSTACK_SECRET_KEY` and `SUPABASE_SECRET_KEY`. Prefer the current Supabase secret key format (`sb_secret_...`) for `SUPABASE_SECRET_KEY`; use a legacy service-role key only if the secret key is unavailable. WhatsApp Phase 1 requires server-only `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_HOTEL_SLUG`. Keep real values out of Git.

## First Owner Setup

Do not create fake auth users in migrations. Create the real owner user in Supabase Auth, then link that user's UUID to `3dHotels` with the one-time SQL command in `docs/first-owner-setup.md`.

## Supabase Migrations

Database changes live in `supabase/migrations`.

Do not deploy migrations until they have been reviewed. When ready, apply them with the Supabase CLI from this repository after logging in and linking the project:

```bash
supabase db push
```

## Development

```bash
npm install
npm run dev
```

Open `/login` to sign in. Authenticated active owners are routed to `/dashboard`.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

## WhatsApp Phase 1

WhatsApp Cloud API booking automation is exposed at `/api/whatsapp/webhook`. Configure these server-only values in `.env.local` or deployment secrets only:

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_HOTEL_SLUG=3dhotels`
- `APP_URL`

Incoming POST webhooks are verified with `x-hub-signature-256`. Meta retries are idempotent through `public.whatsapp_processed_messages`. The deterministic Phase 1 flow creates reservations only after the guest replies `CONFIRM`, then sends a Paystack hosted checkout link. Payment ledger updates still depend on the signed Paystack webhook.
