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

  select coalesce(sum(payments.amount), 0)
  into v_amount_paid
  from public.payments
  where payments.hotel_id = v_staff_hotel_id
    and payments.reservation_id = v_reservation.id
    and payments.status in ('paid', 'partially_paid');

  v_balance := greatest(0, v_stay_value - v_amount_paid);

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
