alter table public.payments
add column if not exists provider text;

alter table public.payments
add column if not exists provider_access_code text;

alter table public.payments
add column if not exists provider_authorization_url text;

alter table public.payments
add column if not exists provider_expected_amount numeric(12, 2);

alter table public.payments
add column if not exists provider_currency text;

alter table public.payments
add column if not exists provider_customer_email text;

alter table public.payments
add column if not exists provider_verified_at timestamptz;

create unique index if not exists payments_paystack_reference_idx
on public.payments(reference)
where provider = 'paystack' and reference is not null;

create or replace function public.create_paystack_payment_intent(
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
security invoker
set search_path = public
as $$
declare
  v_staff_hotel_id uuid := public.current_staff_hotel_id();
  v_staff_role public.staff_role := public.current_staff_role();
  v_reservation record;
  v_payment_id uuid;
  v_stay_value numeric(12, 2);
  v_folio_total numeric(12, 2);
  v_amount_paid numeric(12, 2);
  v_balance numeric(12, 2);
  v_reference text := nullif(trim(coalesce(p_reference, '')), '');
  v_currency text := upper(trim(coalesce(p_currency, 'NGN')));
begin
  if v_staff_hotel_id is null or v_staff_role not in ('owner', 'front_desk') then
    return query select false, 'You are not authorised to generate Paystack payment links.', null::uuid;
    return;
  end if;

  if p_amount is null or p_amount <= 0 then
    return query select false, 'Payment amount must be greater than zero.', null::uuid;
    return;
  end if;

  if v_reference is null then
    return query select false, 'Paystack reference is required.', null::uuid;
    return;
  end if;

  if nullif(trim(coalesce(p_customer_email, '')), '') is null then
    return query select false, 'Guest email is required for Paystack payment.', null::uuid;
    return;
  end if;

  if nullif(trim(coalesce(p_authorization_url, '')), '') is null or nullif(trim(coalesce(p_access_code, '')), '') is null then
    return query select false, 'Paystack authorization details are required.', null::uuid;
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
    and reservations.hotel_id = v_staff_hotel_id
  for update;

  if not found then
    return query select false, 'Reservation not found for this hotel.', null::uuid;
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
    idempotency_key,
    provider,
    provider_access_code,
    provider_authorization_url,
    provider_expected_amount,
    provider_currency,
    provider_customer_email
  ) values (
    v_staff_hotel_id,
    v_reservation.id,
    'paystack_card',
    'unpaid',
    p_amount,
    v_reference,
    'Paystack payment link generated for ' || trim(p_customer_email),
    auth.uid(),
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
    select payments.id
    into v_payment_id
    from public.payments
    where payments.provider = 'paystack'
      and payments.reference = v_reference;

    return query select true, 'Paystack payment link already generated.', v_payment_id;
end;
$$;

revoke all on function public.create_paystack_payment_intent(uuid, numeric, text, text, text, text, text) from public;
grant execute on function public.create_paystack_payment_intent(uuid, numeric, text, text, text, text, text) to authenticated;
