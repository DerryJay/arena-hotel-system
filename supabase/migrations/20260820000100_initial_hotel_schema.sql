create extension if not exists pgcrypto;

create type public.staff_role as enum ('owner', 'manager', 'front_desk', 'housekeeping', 'accounting');
create type public.room_status as enum ('available', 'occupied', 'dirty', 'maintenance', 'blocked');
create type public.reservation_status as enum ('draft', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show');
create type public.housekeeping_status as enum ('todo', 'in_progress', 'done', 'verified');
create type public.payment_status as enum ('pending', 'paid', 'refunded', 'void');

create table public.hotels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text,
  phone text,
  email text,
  timezone text not null default 'Africa/Lagos',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hotel_id uuid references public.hotels(id) on delete set null,
  full_name text not null,
  role public.staff_role not null default 'front_desk',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.room_types (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  name text not null,
  description text,
  base_rate numeric(12, 2) not null check (base_rate >= 0),
  max_occupancy integer not null default 2 check (max_occupancy > 0),
  created_at timestamptz not null default now(),
  unique (hotel_id, name)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_type_id uuid not null references public.room_types(id) on delete restrict,
  room_number text not null,
  floor text,
  status public.room_status not null default 'available',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, room_number)
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  identification text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  guest_id uuid not null references public.guests(id) on delete restrict,
  status public.reservation_status not null default 'confirmed',
  check_in date not null,
  check_out date not null,
  adults integer not null default 1 check (adults > 0),
  children integer not null default 0 check (children >= 0),
  nightly_rate numeric(12, 2) not null check (nightly_rate >= 0),
  source text not null default 'front_desk',
  notes text,
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in)
);

create table public.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  assigned_to uuid references public.staff_profiles(id) on delete set null,
  status public.housekeeping_status not null default 'todo',
  due_on date not null default current_date,
  checklist jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.folio_charges (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  posted_at timestamptz not null default now(),
  created_by uuid references public.staff_profiles(id) on delete set null
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  method text not null default 'cash',
  status public.payment_status not null default 'paid',
  amount numeric(12, 2) not null check (amount >= 0),
  reference text,
  posted_at timestamptz not null default now(),
  created_by uuid references public.staff_profiles(id) on delete set null
);

create index reservations_hotel_dates_idx on public.reservations(hotel_id, check_in, check_out);
create index reservations_status_idx on public.reservations(status);
create index rooms_hotel_status_idx on public.rooms(hotel_id, status);
create index housekeeping_due_idx on public.housekeeping_tasks(hotel_id, due_on, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger hotels_set_updated_at before update on public.hotels
for each row execute function public.set_updated_at();

create trigger staff_profiles_set_updated_at before update on public.staff_profiles
for each row execute function public.set_updated_at();

create trigger rooms_set_updated_at before update on public.rooms
for each row execute function public.set_updated_at();

create trigger guests_set_updated_at before update on public.guests
for each row execute function public.set_updated_at();

create trigger reservations_set_updated_at before update on public.reservations
for each row execute function public.set_updated_at();

create trigger housekeeping_tasks_set_updated_at before update on public.housekeeping_tasks
for each row execute function public.set_updated_at();

create or replace function public.current_staff_hotel_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select hotel_id
  from public.staff_profiles
  where id = auth.uid()
    and is_active = true
$$;

create or replace function public.current_staff_role()
returns public.staff_role
language sql
security definer
set search_path = public
stable
as $$
  select role
  from public.staff_profiles
  where id = auth.uid()
    and is_active = true
$$;

alter table public.hotels enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.housekeeping_tasks enable row level security;
alter table public.folio_charges enable row level security;
alter table public.payments enable row level security;

create policy "Staff can read their hotel" on public.hotels
for select using (id = public.current_staff_hotel_id());

create policy "Managers can update their hotel" on public.hotels
for update using (
  id = public.current_staff_hotel_id()
  and public.current_staff_role() in ('owner', 'manager')
);

create policy "Staff can read profiles in their hotel" on public.staff_profiles
for select using (hotel_id = public.current_staff_hotel_id() or id = auth.uid());

create policy "Managers can manage staff in their hotel" on public.staff_profiles
for all using (
  hotel_id = public.current_staff_hotel_id()
  and public.current_staff_role() in ('owner', 'manager')
) with check (
  hotel_id = public.current_staff_hotel_id()
  and public.current_staff_role() in ('owner', 'manager')
);

create policy "Staff can access room types in their hotel" on public.room_types
for all using (hotel_id = public.current_staff_hotel_id())
with check (hotel_id = public.current_staff_hotel_id());

create policy "Staff can access rooms in their hotel" on public.rooms
for all using (hotel_id = public.current_staff_hotel_id())
with check (hotel_id = public.current_staff_hotel_id());

create policy "Staff can access guests in their hotel" on public.guests
for all using (hotel_id = public.current_staff_hotel_id())
with check (hotel_id = public.current_staff_hotel_id());

create policy "Staff can access reservations in their hotel" on public.reservations
for all using (hotel_id = public.current_staff_hotel_id())
with check (hotel_id = public.current_staff_hotel_id());

create policy "Staff can access housekeeping in their hotel" on public.housekeeping_tasks
for all using (hotel_id = public.current_staff_hotel_id())
with check (hotel_id = public.current_staff_hotel_id());

create policy "Staff can read folio charges in their hotel" on public.folio_charges
for select using (hotel_id = public.current_staff_hotel_id());

create policy "Front desk can create folio charges" on public.folio_charges
for insert with check (
  hotel_id = public.current_staff_hotel_id()
  and public.current_staff_role() in ('owner', 'manager', 'front_desk', 'accounting')
);

create policy "Staff can read payments in their hotel" on public.payments
for select using (hotel_id = public.current_staff_hotel_id());

create policy "Front desk can record payments" on public.payments
for insert with check (
  hotel_id = public.current_staff_hotel_id()
  and public.current_staff_role() in ('owner', 'manager', 'front_desk', 'accounting')
);

