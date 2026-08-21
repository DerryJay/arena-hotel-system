create table if not exists public.whatsapp_sessions (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  wa_id text not null,
  phone_number text,
  step text not null default 'start',
  check_in date,
  check_out date,
  selected_room_id uuid references public.rooms(id) on delete set null,
  selected_room_type_id uuid references public.room_types(id) on delete set null,
  guest_name text,
  guest_email text,
  reservation_id uuid references public.reservations(id) on delete set null,
  available_rooms jsonb not null default '[]'::jsonb,
  payment_confirmation_sent_at timestamptz,
  last_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, wa_id)
);

create table if not exists public.whatsapp_processed_messages (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  message_id text not null,
  wa_id text not null,
  created_at timestamptz not null default now(),
  unique (hotel_id, message_id)
);

drop trigger if exists whatsapp_sessions_set_updated_at on public.whatsapp_sessions;
create trigger whatsapp_sessions_set_updated_at before update on public.whatsapp_sessions
for each row execute function public.set_updated_at();

alter table public.whatsapp_sessions enable row level security;
alter table public.whatsapp_processed_messages enable row level security;

create policy "Staff can read WhatsApp sessions in their hotel" on public.whatsapp_sessions
for select using (hotel_id = public.current_staff_hotel_id());

create policy "Staff can read WhatsApp processed messages in their hotel" on public.whatsapp_processed_messages
for select using (hotel_id = public.current_staff_hotel_id());

grant usage on schema public to service_role;
grant select, insert, update on table public.whatsapp_sessions to service_role;
grant select, insert on table public.whatsapp_processed_messages to service_role;

create or replace function public.create_whatsapp_reservation(
  p_hotel_slug text,
  p_wa_id text,
  p_room_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_phone text,
  p_check_in date,
  p_check_out date
)
returns table (
  ok boolean,
  message text,
  reservation_id uuid,
  guest_id uuid,
  booking_reference text,
  room_number text,
  nightly_rate numeric,
  total_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hotel_id uuid;
  v_room record;
  v_guest_id uuid;
  v_reservation_id uuid;
  v_booking_reference text;
  v_nights integer;
begin
  select hotels.id into v_hotel_id from public.hotels where hotels.slug = p_hotel_slug;

  if v_hotel_id is null then
    return query select false, 'Hotel is not configured for WhatsApp booking.', null::uuid, null::uuid, null::text, null::text, 0::numeric, 0::numeric;
    return;
  end if;

  if p_check_out <= p_check_in then
    return query select false, 'Check-out must be after check-in.', null::uuid, null::uuid, null::text, null::text, 0::numeric, 0::numeric;
    return;
  end if;

  select rooms.id, rooms.room_number, rooms.status, rooms.room_type_id, room_types.base_rate
  into v_room
  from public.rooms
  join public.room_types on room_types.id = rooms.room_type_id
  where rooms.id = p_room_id
    and rooms.hotel_id = v_hotel_id
    and room_types.hotel_id = v_hotel_id
  for update of rooms;

  if not found then
    return query select false, 'Selected room was not found for this hotel.', null::uuid, null::uuid, null::text, null::text, 0::numeric, 0::numeric;
    return;
  end if;

  if v_room.status in ('occupied', 'cleaning', 'maintenance', 'blocked') then
    return query select false, 'Selected room is no longer available.', null::uuid, null::uuid, null::text, null::text, 0::numeric, 0::numeric;
    return;
  end if;

  if exists (
    select 1
    from public.reservations
    where reservations.hotel_id = v_hotel_id
      and reservations.room_id = p_room_id
      and reservations.status in ('reserved', 'confirmed', 'checked_in')
      and reservations.check_in < p_check_out
      and reservations.check_out > p_check_in
  ) then
    return query select false, 'Selected room is no longer available.', null::uuid, null::uuid, null::text, null::text, 0::numeric, 0::numeric;
    return;
  end if;

  select guests.id
  into v_guest_id
  from public.guests
  where guests.hotel_id = v_hotel_id
    and guests.phone = p_phone
  order by guests.created_at asc
  limit 1;

  if v_guest_id is null then
    insert into public.guests (hotel_id, full_name, email, phone, notes)
    values (v_hotel_id, trim(p_guest_name), nullif(trim(coalesce(p_guest_email, '')), ''), trim(p_phone), 'Created from WhatsApp booking')
    returning id into v_guest_id;
  else
    update public.guests
    set full_name = trim(p_guest_name), email = coalesce(nullif(trim(coalesce(p_guest_email, '')), ''), email)
    where id = v_guest_id;
  end if;

  insert into public.reservations (
    hotel_id,
    room_id,
    guest_id,
    status,
    check_in,
    check_out,
    adults,
    children,
    nightly_rate,
    source,
    notes
  ) values (
    v_hotel_id,
    p_room_id,
    v_guest_id,
    'confirmed',
    p_check_in,
    p_check_out,
    1,
    0,
    v_room.base_rate,
    'whatsapp',
    'Created from WhatsApp booking for ' || p_wa_id
  )
  returning id, booking_reference into v_reservation_id, v_booking_reference;

  update public.whatsapp_sessions
  set reservation_id = v_reservation_id,
      step = 'payment_link_sent'
  where hotel_id = v_hotel_id
    and wa_id = p_wa_id
    and reservation_id is null;

  v_nights := greatest(0, p_check_out - p_check_in);

  return query select true, 'Reservation created.', v_reservation_id, v_guest_id, v_booking_reference, v_room.room_number, v_room.base_rate, (v_nights * v_room.base_rate)::numeric;
exception
  when exclusion_violation then
    return query select false, 'Selected room is no longer available.', null::uuid, null::uuid, null::text, null::text, 0::numeric, 0::numeric;
end;
$$;

revoke all on function public.create_whatsapp_reservation(text, text, uuid, text, text, text, date, date) from public;
grant execute on function public.create_whatsapp_reservation(text, text, uuid, text, text, text, date, date) to service_role;

create or replace function public.create_whatsapp_paystack_intent(
  p_hotel_id uuid,
  p_reservation_id uuid,
  p_amount numeric,
  p_reference text,
  p_access_code text,
  p_authorization_url text,
  p_customer_email text,
  p_currency text
)
returns table (
  ok boolean,
  message text,
  payment_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_reservation record;
  v_stay_value numeric(12, 2);
  v_folio_total numeric(12, 2);
  v_amount_paid numeric(12, 2);
  v_balance numeric(12, 2);
  v_reference text := nullif(trim(coalesce(p_reference, '')), '');
  v_currency text := upper(trim(coalesce(p_currency, 'NGN')));
begin
  if p_amount is null or p_amount <= 0 then
    return query select false, 'Payment amount must be greater than zero.', null::uuid;
    return;
  end if;

  if v_reference is null then
    return query select false, 'Paystack reference is required.', null::uuid;
    return;
  end if;

  if v_currency <> 'NGN' then
    return query select false, 'Only NGN Paystack payments are supported.', null::uuid;
    return;
  end if;

  select reservations.id, reservations.hotel_id, reservations.check_in, reservations.check_out, reservations.nightly_rate
  into v_reservation
  from public.reservations
  where reservations.id = p_reservation_id
    and reservations.hotel_id = p_hotel_id
    and reservations.source = 'whatsapp'
  for update;

  if not found then
    return query select false, 'WhatsApp reservation not found for this hotel.', null::uuid;
    return;
  end if;

  select payments.id
  into v_payment_id
  from public.payments
  where payments.provider = 'paystack'
    and payments.reference = v_reference;

  if found then
    return query select true, 'Paystack payment link already generated.', v_payment_id;
    return;
  end if;

  v_stay_value := greatest(0, v_reservation.check_out - v_reservation.check_in) * v_reservation.nightly_rate;

  select coalesce(sum(folio_charges.amount), 0)
  into v_folio_total
  from public.folio_charges
  where folio_charges.hotel_id = p_hotel_id
    and folio_charges.reservation_id = v_reservation.id;

  select coalesce(sum(payments.amount), 0)
  into v_amount_paid
  from public.payments
  where payments.hotel_id = p_hotel_id
    and payments.reservation_id = v_reservation.id
    and payments.status in ('paid', 'partially_paid');

  v_balance := greatest(0, v_stay_value + v_folio_total - v_amount_paid);

  if p_amount > v_balance then
    return query select false, 'Payment amount cannot exceed the outstanding balance.', null::uuid;
    return;
  end if;

  insert into public.payments (
    hotel_id,
    reservation_id,
    method,
    status,
    amount,
    reference,
    notes,
    idempotency_key,
    provider,
    provider_access_code,
    provider_authorization_url,
    provider_expected_amount,
    provider_currency,
    provider_customer_email
  ) values (
    p_hotel_id,
    p_reservation_id,
    'paystack_card',
    'unpaid',
    p_amount,
    v_reference,
    'Paystack payment link generated from WhatsApp for ' || trim(p_customer_email),
    'paystack:' || v_reference,
    'paystack',
    trim(p_access_code),
    trim(p_authorization_url),
    p_amount,
    v_currency,
    trim(p_customer_email)
  )
  returning id into v_payment_id;

  return query select true, 'Paystack payment link generated.', v_payment_id;
exception
  when unique_violation then
    select payments.id into v_payment_id from public.payments where payments.provider = 'paystack' and payments.reference = v_reference;
    return query select true, 'Paystack payment link already generated.', v_payment_id;
end;
$$;

revoke all on function public.create_whatsapp_paystack_intent(uuid, uuid, numeric, text, text, text, text, text) from public;
grant execute on function public.create_whatsapp_paystack_intent(uuid, uuid, numeric, text, text, text, text, text) to service_role;
