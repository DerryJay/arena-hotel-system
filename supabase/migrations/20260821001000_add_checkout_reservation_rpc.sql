alter table public.reservations
add column if not exists checkout_balance_due numeric(12, 2) not null default 0 check (checkout_balance_due >= 0);

create or replace function public.checkout_reservation(
  p_reservation_id uuid,
  p_confirm_balance_due boolean default false
)
returns table (
  ok boolean,
  message text,
  booking_reference text,
  guest_name text,
  room_number text,
  outstanding_balance numeric,
  housekeeping_task_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff_hotel_id uuid := public.current_staff_hotel_id();
  v_staff_role public.staff_role := public.current_staff_role();
  v_reservation record;
  v_stay_value numeric(12, 2);
  v_folio_total numeric(12, 2);
  v_payment_total numeric(12, 2);
  v_balance numeric(12, 2);
  v_housekeeping_task_id uuid;
  v_due_date date;
begin
  if v_staff_hotel_id is null or v_staff_role not in ('owner', 'front_desk') then
    return query select false, 'You are not authorised to check out reservations.', null::text, null::text, null::text, 0::numeric, null::uuid;
    return;
  end if;

  select
    reservations.id,
    reservations.hotel_id,
    reservations.status,
    reservations.check_in,
    reservations.check_out,
    reservations.nightly_rate,
    reservations.room_id,
    reservations.booking_reference,
    rooms.status as room_status,
    rooms.room_number,
    guests.full_name as guest_name
  into v_reservation
  from public.reservations
  join public.rooms on rooms.id = reservations.room_id
  join public.guests on guests.id = reservations.guest_id
  where reservations.id = p_reservation_id
    and reservations.hotel_id = v_staff_hotel_id
    and rooms.hotel_id = v_staff_hotel_id
  for update of reservations, rooms;

  if not found then
    return query select false, 'Reservation not found for this hotel.', null::text, null::text, null::text, 0::numeric, null::uuid;
    return;
  end if;

  if v_reservation.status <> 'checked_in' then
    return query select false, 'Only checked-in reservations can be checked out.', v_reservation.booking_reference, v_reservation.guest_name, v_reservation.room_number, 0::numeric, null::uuid;
    return;
  end if;

  if v_reservation.room_status <> 'occupied' then
    return query select false, 'Checkout expects the room to be occupied.', v_reservation.booking_reference, v_reservation.guest_name, v_reservation.room_number, 0::numeric, null::uuid;
    return;
  end if;

  v_stay_value := greatest(0, v_reservation.check_out - v_reservation.check_in) * v_reservation.nightly_rate;

  select coalesce(sum(folio_charges.amount), 0)
  into v_folio_total
  from public.folio_charges
  where folio_charges.hotel_id = v_staff_hotel_id
    and folio_charges.reservation_id = v_reservation.id;

  select coalesce(sum(payments.amount), 0)
  into v_payment_total
  from public.payments
  where payments.hotel_id = v_staff_hotel_id
    and payments.reservation_id = v_reservation.id
    and payments.status in ('paid', 'partially_paid');

  v_balance := greatest(0, v_stay_value + v_folio_total - v_payment_total);

  select timezone(hotels.timezone, now())::date
  into v_due_date
  from public.hotels
  where hotels.id = v_staff_hotel_id;

  if v_balance > 0 and not p_confirm_balance_due then
    return query select false, 'Outstanding balance requires confirmation before checkout.', v_reservation.booking_reference, v_reservation.guest_name, v_reservation.room_number, v_balance, null::uuid;
    return;
  end if;

  update public.reservations
  set
    status = 'checked_out',
    checkout_balance_due = v_balance
  where id = v_reservation.id
    and hotel_id = v_staff_hotel_id;

  update public.rooms
  set status = 'cleaning'
  where id = v_reservation.room_id
    and hotel_id = v_staff_hotel_id;

  select housekeeping_tasks.id
  into v_housekeeping_task_id
  from public.housekeeping_tasks
  where housekeeping_tasks.hotel_id = v_staff_hotel_id
    and housekeeping_tasks.room_id = v_reservation.room_id
    and housekeeping_tasks.status in ('todo', 'in_progress')
    and housekeeping_tasks.notes = 'Created from checkout for ' || coalesce(v_reservation.booking_reference, v_reservation.id::text)
  order by housekeeping_tasks.created_at asc
  limit 1;

  if v_housekeeping_task_id is null then
    insert into public.housekeeping_tasks (hotel_id, room_id, status, due_on, notes)
    values (
      v_staff_hotel_id,
      v_reservation.room_id,
      'todo',
      coalesce(v_due_date, current_date),
      'Created from checkout for ' || coalesce(v_reservation.booking_reference, v_reservation.id::text)
    )
    returning id into v_housekeeping_task_id;
  end if;

  return query select true, 'Reservation checked out.', v_reservation.booking_reference, v_reservation.guest_name, v_reservation.room_number, v_balance, v_housekeeping_task_id;
end;
$$;

revoke all on function public.checkout_reservation(uuid, boolean) from public;
grant execute on function public.checkout_reservation(uuid, boolean) to authenticated;

create or replace function public.record_reservation_payment(
  p_reservation_id uuid,
  p_amount numeric,
  p_method text,
  p_reference text,
  p_notes text,
  p_idempotency_key text
)
returns table (
  ok boolean,
  message text,
  payment_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff_hotel_id uuid;
  v_staff_role public.staff_role;
  v_reservation record;
  v_payment_id uuid;
  v_method text := lower(trim(coalesce(p_method, '')));
  v_idempotency_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_stay_value numeric(12, 2);
  v_folio_total numeric(12, 2);
  v_amount_paid numeric(12, 2);
  v_balance numeric(12, 2);
begin
  v_staff_hotel_id := public.current_staff_hotel_id();
  v_staff_role := public.current_staff_role();

  if v_staff_hotel_id is null or v_staff_role not in ('owner', 'front_desk') then
    return query select false, 'You are not authorised to record payments.', null::uuid;
    return;
  end if;

  if p_amount is null or p_amount <= 0 then
    return query select false, 'Payment amount must be greater than zero.', null::uuid;
    return;
  end if;

  if v_method not in ('cash', 'bank_transfer', 'pos_card') then
    return query select false, 'Invalid payment method.', null::uuid;
    return;
  end if;

  if v_idempotency_key is null then
    return query select false, 'Payment request key is required.', null::uuid;
    return;
  end if;

  select reservations.id, reservations.hotel_id, reservations.check_in, reservations.check_out, reservations.nightly_rate
  into v_reservation
  from public.reservations
  where reservations.id = p_reservation_id
    and reservations.hotel_id = v_staff_hotel_id
  for update;

  if not found then
    return query select false, 'Reservation not found for this hotel.', null::uuid;
    return;
  end if;

  select payments.id
  into v_payment_id
  from public.payments
  where payments.hotel_id = v_staff_hotel_id
    and payments.idempotency_key = v_idempotency_key;

  if found then
    return query select true, 'Payment already recorded.', v_payment_id;
    return;
  end if;

  v_stay_value := greatest(0, v_reservation.check_out - v_reservation.check_in) * v_reservation.nightly_rate;

  select coalesce(sum(folio_charges.amount), 0)
  into v_folio_total
  from public.folio_charges
  where folio_charges.hotel_id = v_staff_hotel_id
    and folio_charges.reservation_id = v_reservation.id;

  select coalesce(sum(payments.amount), 0)
  into v_amount_paid
  from public.payments
  where payments.hotel_id = v_staff_hotel_id
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
    created_by,
    idempotency_key
  ) values (
    v_staff_hotel_id,
    v_reservation.id,
    v_method,
    'paid',
    p_amount,
    nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid(),
    v_idempotency_key
  )
  returning id into v_payment_id;

  return query select true, 'Payment recorded.', v_payment_id;
exception
  when unique_violation then
    select payments.id
    into v_payment_id
    from public.payments
    where payments.hotel_id = v_staff_hotel_id
      and payments.idempotency_key = v_idempotency_key;

    return query select true, 'Payment already recorded.', v_payment_id;
end;
$$;
