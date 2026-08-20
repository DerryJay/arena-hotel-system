create or replace function public.check_in_reservation(p_reservation_id uuid)
returns table (
  ok boolean,
  message text,
  booking_reference text,
  guest_name text,
  room_number text,
  reservation_status public.reservation_status,
  early_check_in boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff_hotel_id uuid := public.current_staff_hotel_id();
  v_staff_role public.staff_role := public.current_staff_role();
  v_reservation record;
begin
  if v_staff_hotel_id is null or v_staff_role not in ('owner', 'front_desk') then
    return query select false, 'You are not authorised to check in reservations.', null::text, null::text, null::text, null::public.reservation_status, false;
    return;
  end if;

  select
    reservations.id,
    reservations.hotel_id,
    reservations.status,
    reservations.check_in,
    reservations.booking_reference,
    reservations.room_id,
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
    return query select false, 'Reservation not found for this hotel.', null::text, null::text, null::text, null::public.reservation_status, false;
    return;
  end if;

  if v_reservation.status not in ('confirmed', 'reserved') then
    return query select false, 'Only confirmed or reserved reservations can be checked in.', v_reservation.booking_reference, v_reservation.guest_name, v_reservation.room_number, v_reservation.status, false;
    return;
  end if;

  if v_reservation.room_status in ('maintenance', 'blocked') then
    return query select false, 'Room is not available for check-in.', v_reservation.booking_reference, v_reservation.guest_name, v_reservation.room_number, v_reservation.status, false;
    return;
  end if;

  update public.reservations
  set status = 'checked_in'
  where id = v_reservation.id;

  update public.rooms
  set status = 'occupied'
  where id = v_reservation.room_id;

  return query select
    true,
    case
      when v_reservation.check_in > current_date then 'Checked in early. Reservation dates were not changed.'
      else 'Reservation checked in.'
    end,
    v_reservation.booking_reference,
    v_reservation.guest_name,
    v_reservation.room_number,
    'checked_in'::public.reservation_status,
    v_reservation.check_in > current_date;
end;
$$;

revoke all on function public.check_in_reservation(uuid) from public;
grant execute on function public.check_in_reservation(uuid) to authenticated;
