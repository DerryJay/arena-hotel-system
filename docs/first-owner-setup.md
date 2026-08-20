# First Owner Setup

Use this only after the schema and `3dHotels` seed migrations have been applied to Supabase.

## 1. Create the real Supabase Auth user

Create the owner user in Supabase Auth using one of these approved local/server-side paths:

- Supabase Dashboard: Authentication -> Users -> Add user
- Your own secure server-side admin flow using the Supabase service-role key stored outside Git

Do not put the owner's email, password, service-role key, or database password in source code, migrations, `.env.example`, commits, or chat.

## 2. Copy the Auth user UUID

In Supabase Dashboard -> Authentication -> Users, copy the new user's UUID.

## 3. Link that UUID to 3dHotels as owner

Run this once in the Supabase SQL editor or through a trusted local `psql` session. Replace the placeholders locally before running.

```sql
with target_hotel as (
  select id
  from public.hotels
  where slug = '3dhotels'
)
insert into public.staff_profiles (id, hotel_id, full_name, role, is_active)
select
  '<OWNER_AUTH_USER_UUID>'::uuid,
  target_hotel.id,
  '<OWNER_FULL_NAME>',
  'owner'::public.staff_role,
  true
from target_hotel
on conflict (id) do update set
  hotel_id = excluded.hotel_id,
  full_name = excluded.full_name,
  role = 'owner'::public.staff_role,
  is_active = true,
  updated_at = now();
```

Expected result: one row in `public.staff_profiles` where `id` is the Auth user UUID, `role` is `owner`, `is_active` is `true`, and `hotel_id` points to the `3dHotels` hotel.
