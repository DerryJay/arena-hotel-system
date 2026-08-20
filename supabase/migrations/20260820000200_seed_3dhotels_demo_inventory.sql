with hotel_seed as (
  insert into public.hotels (name, slug, address, phone, timezone)
  values ('3dHotels', '3dhotels', 'Onitsha, Anambra', '+234070239004', 'Africa/Lagos')
  on conflict (slug) do update set
    name = excluded.name,
    address = excluded.address,
    phone = excluded.phone,
    timezone = excluded.timezone
  returning id
), target_hotel as (
  select id from hotel_seed
  union
  select id from public.hotels where slug = '3dhotels'
  limit 1
), room_type_seed as (
  insert into public.room_types (hotel_id, name, base_rate, max_occupancy)
  select target_hotel.id, room_type.name, room_type.base_rate, room_type.max_occupancy
  from target_hotel
  cross join (
    values
      ('Standard', 25000.00, 2),
      ('Deluxe', 35000.00, 2),
      ('Executive', 45000.00, 3)
  ) as room_type(name, base_rate, max_occupancy)
  on conflict (hotel_id, name) do update set
    base_rate = excluded.base_rate,
    max_occupancy = excluded.max_occupancy
  returning id, hotel_id, name
), target_room_types as (
  select id, hotel_id, name from room_type_seed
  union
  select room_types.id, room_types.hotel_id, room_types.name
  from public.room_types
  join target_hotel on target_hotel.id = room_types.hotel_id
  where room_types.name in ('Standard', 'Deluxe', 'Executive')
), room_seed(room_type_name, room_number, floor) as (
  values
    ('Standard', '101', '1'),
    ('Standard', '102', '1'),
    ('Standard', '103', '1'),
    ('Standard', '104', '1'),
    ('Standard', '105', '1'),
    ('Standard', '106', '1'),
    ('Standard', '107', '1'),
    ('Deluxe', '201', '2'),
    ('Deluxe', '202', '2'),
    ('Deluxe', '203', '2'),
    ('Deluxe', '204', '2'),
    ('Deluxe', '205', '2'),
    ('Deluxe', '206', '2'),
    ('Deluxe', '207', '2'),
    ('Executive', '301', '3'),
    ('Executive', '302', '3'),
    ('Executive', '303', '3'),
    ('Executive', '304', '3'),
    ('Executive', '305', '3'),
    ('Executive', '306', '3'),
    ('Executive', '307', '3')
)
insert into public.rooms (hotel_id, room_type_id, room_number, floor, status)
select target_room_types.hotel_id, target_room_types.id, room_seed.room_number, room_seed.floor, 'available'::public.room_status
from room_seed
join target_room_types on target_room_types.name = room_seed.room_type_name
on conflict (hotel_id, room_number) do update set
  room_type_id = excluded.room_type_id,
  floor = excluded.floor;
