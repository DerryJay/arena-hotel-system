# Arena Hotel System

Version 1 establishes the application foundation for Arena Hotel:

- Vite, React and TypeScript frontend
- Supabase authentication client
- Version-controlled Supabase database migrations
- Core hotel operations dashboard for occupancy, arrivals, departures, rooms and housekeeping

## Environment

Copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL`: your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: your Supabase public anon key

Never commit service-role keys, passwords or other secrets.

## Supabase Migrations

Database changes live in `supabase/migrations`.

Apply them with the Supabase CLI from this repository after logging in and linking the project:

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

