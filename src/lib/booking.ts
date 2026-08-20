import type { SupabaseClient } from '@supabase/supabase-js';
import type { RoomStatus } from './types';
import type { StaffHotelAccessRecord } from './auth/access';

export type BookingRole = 'owner' | 'front_desk' | 'manager';

export interface BookingRoomOption {
  id: string;
  roomNumber: string;
  roomTypeId: string;
  roomTypeName: string;
  baseRate: number;
  status: RoomStatus;
}

export interface ExistingInventoryReservation {
  room_id: string;
  check_in: string;
  check_out: string;
  status: string;
}

export interface BookingValidationInput {
  guestName: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  selectedRoomId?: string;
}

export interface BookingValidationResult {
  ok: boolean;
  errors: string[];
}

export interface CreateBookingInput extends BookingValidationInput {
  email?: string;
  children: number;
  roomTypeId?: string;
  nightlyRate: number;
  source: string;
  notes?: string;
}

export interface BookingConfirmation {
  bookingReference: string;
  guestName: string;
  roomNumber: string;
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  totalStayValue: number;
}

const inventoryHoldingStatuses = new Set(['reserved', 'confirmed', 'checked_in']);
const unavailableOperationalStatuses = new Set<RoomStatus>(['maintenance', 'blocked']);
const allowedBookingRoles = new Set(['owner', 'front_desk']);
const allowedBookingSources = new Set(['front_desk', 'phone', 'walk_in', 'email']);

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

export function isAuthorizedBookingRole(role: string): role is BookingRole {
  return allowedBookingRoles.has(role);
}

export function datesOverlap(existingCheckIn: string, existingCheckOut: string, nextCheckIn: string, nextCheckOut: string): boolean {
  return existingCheckIn < nextCheckOut && existingCheckOut > nextCheckIn;
}

export function validateBookingInput(input: BookingValidationInput): BookingValidationResult {
  const errors: string[] = [];

  if (!input.guestName.trim()) {
    errors.push('Guest full name is required.');
  }

  if (!input.phone.trim()) {
    errors.push('Phone number is required.');
  }

  if (!input.checkIn || !input.checkOut || input.checkOut <= input.checkIn) {
    errors.push('Check-out must be after check-in.');
  }

  if (!Number.isInteger(input.adults) || input.adults < 1) {
    errors.push('Adults must be at least 1.');
  }

  if (!input.selectedRoomId) {
    errors.push('Select an available room.');
  }

  return { ok: errors.length === 0, errors };
}

export function filterAvailableRooms(
  rooms: BookingRoomOption[],
  reservations: ExistingInventoryReservation[],
  checkIn: string,
  checkOut: string
): BookingRoomOption[] {
  const blockedRoomIds = new Set(
    reservations
      .filter((reservation) => inventoryHoldingStatuses.has(reservation.status))
      .filter((reservation) => datesOverlap(reservation.check_in, reservation.check_out, checkIn, checkOut))
      .map((reservation) => reservation.room_id)
  );

  return rooms.filter((room) => !unavailableOperationalStatuses.has(room.status) && !blockedRoomIds.has(room.id));
}

export function normalizeBookingSource(source: string): string {
  return allowedBookingSources.has(source) ? source : 'front_desk';
}

export function getStayNights(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

type RoomRow = {
  id: string;
  room_number: string;
  status: RoomStatus;
  room_type_id: string;
  room_types: {
    name: string;
    base_rate: number | string;
  } | null;
};

type CreatedReservationRow = {
  booking_reference: string | null;
  check_in: string;
  check_out: string;
  nightly_rate: number | string;
  rooms: { room_number: string } | null;
  guests: { full_name: string } | null;
};

export async function getAvailableRoomsForDateRange(
  supabase: SupabaseClient,
  hotelId: string,
  checkIn: string,
  checkOut: string,
  roomTypeId?: string
): Promise<BookingRoomOption[]> {
  if (!checkIn || !checkOut || checkOut <= checkIn) {
    return [];
  }

  let roomsQuery = supabase
    .from('rooms')
    .select('id, room_number, status, room_type_id, room_types(name, base_rate)')
    .eq('hotel_id', hotelId)
    .order('room_number', { ascending: true });

  if (roomTypeId) {
    roomsQuery = roomsQuery.eq('room_type_id', roomTypeId);
  }

  const [roomsResponse, reservationsResponse] = await Promise.all([
    roomsQuery,
    supabase
      .from('reservations')
      .select('room_id, check_in, check_out, status')
      .eq('hotel_id', hotelId)
      .in('status', ['reserved', 'confirmed', 'checked_in'])
      .lt('check_in', checkOut)
      .gt('check_out', checkIn)
  ]);

  if (roomsResponse.error) {
    throw new Error(`Unable to load available rooms: ${roomsResponse.error.message}`);
  }

  if (reservationsResponse.error) {
    throw new Error(`Unable to load room reservations: ${reservationsResponse.error.message}`);
  }

  const rooms = ((roomsResponse.data ?? []) as unknown as RoomRow[]).map((room) => ({
    id: room.id,
    roomNumber: room.room_number,
    roomTypeId: room.room_type_id,
    roomTypeName: room.room_types?.name ?? 'Unassigned',
    baseRate: toNumber(room.room_types?.base_rate),
    status: room.status
  }));

  return filterAvailableRooms(rooms, (reservationsResponse.data ?? []) as ExistingInventoryReservation[], checkIn, checkOut);
}

export async function createBooking(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  input: CreateBookingInput
): Promise<{ ok: true; confirmation: BookingConfirmation } | { ok: false; message: string }> {
  if (!access.hotel_id || !isAuthorizedBookingRole(access.role)) {
    return { ok: false, message: 'You are not authorised to create bookings.' };
  }

  const validation = validateBookingInput(input);

  if (!validation.ok) {
    return { ok: false, message: validation.errors.join(' ') };
  }

  const availableRooms = await getAvailableRoomsForDateRange(supabase, access.hotel_id, input.checkIn, input.checkOut, input.roomTypeId);
  const selectedRoom = availableRooms.find((room) => room.id === input.selectedRoomId);

  if (!selectedRoom) {
    return { ok: false, message: 'Selected room is no longer available for those dates.' };
  }

  let guestId: string | null = null;
  const normalizedPhone = input.phone.trim();
  const normalizedEmail = input.email?.trim() || null;

  const existingGuestResponse = await supabase
    .from('guests')
    .select('id')
    .eq('hotel_id', access.hotel_id)
    .eq('phone', normalizedPhone)
    .maybeSingle<{ id: string }>();

  if (existingGuestResponse.error) {
    return { ok: false, message: `Unable to look up guest: ${existingGuestResponse.error.message}` };
  }

  guestId = existingGuestResponse.data?.id ?? null;

  if (!guestId) {
    const guestResponse = await supabase
      .from('guests')
      .insert({
        hotel_id: access.hotel_id,
        full_name: input.guestName.trim(),
        phone: normalizedPhone,
        email: normalizedEmail
      })
      .select('id')
      .single<{ id: string }>();

    if (guestResponse.error) {
      return { ok: false, message: `Unable to create guest: ${guestResponse.error.message}` };
    }

    guestId = guestResponse.data.id;
  }

  const reservationResponse = await supabase
    .from('reservations')
    .insert({
      hotel_id: access.hotel_id,
      room_id: selectedRoom.id,
      guest_id: guestId,
      status: 'confirmed',
      check_in: input.checkIn,
      check_out: input.checkOut,
      adults: input.adults,
      children: Math.max(0, input.children),
      nightly_rate: input.nightlyRate,
      source: normalizeBookingSource(input.source),
      notes: input.notes?.trim() || null,
      created_by: access.id
    })
    .select('booking_reference, check_in, check_out, nightly_rate, rooms(room_number), guests(full_name)')
    .single<CreatedReservationRow>();

  if (reservationResponse.error) {
    const isConflict = reservationResponse.error.code === '23P01' || reservationResponse.error.message.toLowerCase().includes('exclusion');
    return {
      ok: false,
      message: isConflict
        ? 'Selected room is no longer available for those dates.'
        : `Unable to create reservation: ${reservationResponse.error.message}`
    };
  }

  const created = reservationResponse.data;
  const nightlyRate = toNumber(created.nightly_rate);

  return {
    ok: true,
    confirmation: {
      bookingReference: created.booking_reference ?? 'Pending reference',
      guestName: created.guests?.full_name ?? input.guestName.trim(),
      roomNumber: created.rooms?.room_number ?? selectedRoom.roomNumber,
      checkIn: created.check_in,
      checkOut: created.check_out,
      nightlyRate,
      totalStayValue: nightlyRate * getStayNights(created.check_in, created.check_out)
    }
  };
}

