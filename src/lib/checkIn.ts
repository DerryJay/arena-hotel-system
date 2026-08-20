import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffHotelAccessRecord } from './auth/access';
import type { ReservationStatus, RoomStatus } from './types';

export type CheckInRole = 'owner' | 'front_desk' | 'manager' | 'housekeeping' | 'accounting';

export interface CheckInReservationState {
  reservationHotelId: string;
  roomHotelId: string;
  reservationStatus: ReservationStatus;
  roomStatus: RoomStatus;
  checkIn: string;
}

export interface CheckInRpcRow {
  ok: boolean;
  message: string;
  booking_reference: string | null;
  guest_name: string | null;
  room_number: string | null;
  reservation_status: ReservationStatus | null;
  early_check_in: boolean;
}

export interface CheckInResult {
  ok: boolean;
  message: string;
  bookingReference?: string;
  guestName?: string;
  roomNumber?: string;
  status?: ReservationStatus;
  earlyCheckIn?: boolean;
}

const allowedCheckInRoles = new Set(['owner', 'front_desk']);
const eligibleReservationStatuses = new Set<ReservationStatus>(['confirmed', 'reserved']);
const blockedRoomStatuses = new Set<RoomStatus>(['maintenance', 'blocked']);

export function isAuthorizedCheckInRole(role: string): role is CheckInRole {
  return allowedCheckInRoles.has(role);
}

export function validateCheckInState(access: StaffHotelAccessRecord, state: CheckInReservationState): { ok: true; earlyCheckIn: boolean } | { ok: false; message: string } {
  if (!access.hotel_id || !isAuthorizedCheckInRole(access.role)) {
    return { ok: false, message: 'You are not authorised to check in reservations.' };
  }

  if (state.reservationHotelId !== access.hotel_id || state.roomHotelId !== access.hotel_id) {
    return { ok: false, message: 'Reservation not found for this hotel.' };
  }

  if (!eligibleReservationStatuses.has(state.reservationStatus)) {
    return { ok: false, message: 'Only confirmed or reserved reservations can be checked in.' };
  }

  if (blockedRoomStatuses.has(state.roomStatus)) {
    return { ok: false, message: 'Room is not available for check-in.' };
  }

  return { ok: true, earlyCheckIn: state.checkIn > new Date().toISOString().slice(0, 10) };
}

export function mapCheckInRpcRow(row: CheckInRpcRow): CheckInResult {
  return {
    ok: row.ok,
    message: row.message,
    bookingReference: row.booking_reference ?? undefined,
    guestName: row.guest_name ?? undefined,
    roomNumber: row.room_number ?? undefined,
    status: row.reservation_status ?? undefined,
    earlyCheckIn: row.early_check_in
  };
}

export async function checkInReservation(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  reservationId: string
): Promise<CheckInResult> {
  if (!reservationId) {
    return { ok: false, message: 'Select a reservation to check in.' };
  }

  if (!access.hotel_id || !isAuthorizedCheckInRole(access.role)) {
    return { ok: false, message: 'You are not authorised to check in reservations.' };
  }

  const response = await supabase
    .rpc('check_in_reservation', { p_reservation_id: reservationId })
    .single<CheckInRpcRow>();

  if (response.error) {
    return { ok: false, message: `Unable to check in reservation: ${response.error.message}` };
  }

  return mapCheckInRpcRow(response.data);
}
