# Arena Hotel System

Version 1 establishes the application foundation for Arena Hotel:

- Next.js App Router, React and TypeScript frontend
- Supabase authentication client using public anon credentials only
- Version-controlled Supabase database migrations
- Core hotel operations dashboard for occupancy, arrivals, departures, rooms and housekeeping
- Database-level double-booking prevention for inventory-holding reservations

## Architecture Decision

The project now uses Next.js instead of the initial Vite scaffold because the planned integrations need secure server-side execution:

- Paystack transaction initialization and verification with secret keys
- Paystack webhooks
- Meta WhatsApp Cloud API webhooks
- Transactional hotel booking operations

Browser code must only receive public values such as the Supabase URL and anon key. Future Paystack, WhatsApp and service-role values belong in server-only route handlers, server actions or deployment secrets.

## Environment

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: your Supabase public anon key

Later server-only integrations will also need values such as `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET`, `META_WHATSAPP_VERIFY_TOKEN`, `META_WHATSAPP_ACCESS_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY`. Keep real values out of Git.

## Supabase Migrations

Database changes live in `supabase/migrations`.

Do not deploy the Version 1 migration until it has been reviewed. When ready, apply it with the Supabase CLI from this repository after logging in and linking the project:

```bash
supabase db push
```

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
