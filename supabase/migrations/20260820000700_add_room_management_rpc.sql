create or replace function public.manage_room(
  p_room_id uuid,
  p_room_number text,
  p_room_type_id uuid,
  p_floor text,
  p_status public.room_status,
  p_notes text,
  p_base_rate numeric,
  p_max_occupancy integer,
  p_description text
)
returns table (
  ok boolean,
  message text,
  room_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_hotel_id uuid;
  v_staff_role public.staff_role;
  v_room record;
  v_room_type record;
  v_room_id uuid;
begin
  select staff_profiles.hotel_id, staff_profiles.role
  into v_staff_hotel_id, v_staff_role
  from public.staff_profiles
  where staff_profiles.id = auth.uid()
    and staff_profiles.is_active = true;

  if v_staff_hotel_id is null or v_staff_role not in ('owner', 'front_desk') then
    return query select false, 'You are not authorised to manage rooms.', null::uuid;
    return;
  end if;

  if nullif(trim(p_room_number), '') is null then
    return query select false, 'Room number is required.', null::uuid;
    return;
  end if;

  if p_status not in ('available', 'cleaning', 'maintenance', 'blocked', 'occupied') then
    return query select false, 'Invalid room status.', null::uuid;
    return;
  end if;

  if p_base_rate is null or p_base_rate < 0 then
    return query select false, 'Nightly rate must be zero or greater.', null::uuid;
    return;
  end if;

  if p_max_occupancy is null or p_max_occupancy < 1 then
    return query select false, 'Capacity must be at least 1.', null::uuid;
    return;
  end if;

  select room_types.id, room_types.hotel_id
  into v_room_type
  from public.room_types
  where room_types.id = p_room_type_id
    and room_types.hotel_id = v_staff_hotel_id
  for update;

  if not found then
    return query select false, 'Room type not found for this hotel.', null::uuid;
    return;
  end if;

  if p_room_id is not null then
    select rooms.id, rooms.hotel_id, rooms.status
    into v_room
    from public.rooms
    where rooms.id = p_room_id
      and rooms.hotel_id = v_staff_hotel_id
    for update;

    if not found then
      return query select false, 'Room not found for this hotel.', null::uuid;
      return;
    end if;

    if v_room.status = 'occupied' and p_status <> 'occupied' then
      return query select false, 'Occupied rooms can only be released by checkout.', v_room.id;
      return;
    end if;

    if v_room.status <> 'occupied' and p_status = 'occupied' then
      return query select false, 'Rooms can only become occupied through check-in.', v_room.id;
      return;
    end if;
  elsif p_status = 'occupied' then
    return query select false, 'New rooms cannot be created as occupied.', null::uuid;
    return;
  end if;

  update public.room_types
  set
    base_rate = p_base_rate,
    max_occupancy = p_max_occupancy,
    description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_room_type_id
    and hotel_id = v_staff_hotel_id;

  if p_room_id is null then
    insert into public.rooms (hotel_id, room_type_id, room_number, floor, status, notes)
    values (
      v_staff_hotel_id,
      p_room_type_id,
      trim(p_room_number),
      nullif(trim(coalesce(p_floor, '')), ''),
      p_status,
      nullif(trim(coalesce(p_notes, '')), '')
    )
    returning id into v_room_id;

    return query select true, 'Room added.', v_room_id;
    return;
  end if;

  update public.rooms
  set
    room_type_id = p_room_type_id,
    room_number = trim(p_room_number),
    floor = nullif(trim(coalesce(p_floor, '')), ''),
    status = p_status,
    notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_room_id
    and hotel_id = v_staff_hotel_id;

  return query select true, 'Room updated.', p_room_id;
exception
  when unique_violation then
    return query select false, 'A room with this number already exists for this hotel.', null::uuid;
end;
$$;

revoke all on function public.manage_room(uuid, text, uuid, text, public.room_status, text, numeric, integer, text) from public;
grant execute on function public.manage_room(uuid, text, uuid, text, public.room_status, text, numeric, integer, text) to authenticated;
