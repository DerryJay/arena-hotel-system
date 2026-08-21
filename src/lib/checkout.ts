import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffHotelAccessRecord } from './auth/access';
import type { ReservationStatus, RoomStatus } from './types';

export interface CheckoutReservationState {
  accessHotelId: string | null;
  role: string;
  reservationHotelId: string;
  roomHotelId: string;
  reservationStatus: ReservationStatus;
  roomStatus: RoomStatus;
  outstandingBalance: number;
  confirmedBalanceDue: boolean;
}

export interface CheckoutRpcRow {
  ok: boolean;
  message: string;
  booking_reference: string | null;
  guest_name: string | null;
  room_number: string | null;
  outstanding_balance: number | string;
  housekeeping_task_id: string | null;
}

export interface CheckoutResult {
  ok: boolean;
  message: string;
  bookingReference?: string;
  guestName?: string;
  roomNumber?: string;
  outstandingBalance: number;
  housekeepingTaskId?: string;
}

const checkoutRoles = new Set(['owner', 'front_desk']);

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

export function isAuthorizedCheckoutRole(role: string): boolean {
  return checkoutRoles.has(role);
}

export function validateCheckoutState(state: CheckoutReservationState): { ok: true } | { ok: false; message: string } {
  if (!state.accessHotelId || !isAuthorizedCheckoutRole(state.role)) {
    return { ok: false, message: 'You are not authorised to check out reservations.' };
  }

  if (state.reservationHotelId !== state.accessHotelId || state.roomHotelId !== state.accessHotelId) {
    return { ok: false, message: 'Reservation not found for this hotel.' };
  }

  if (state.reservationStatus !== 'checked_in') {
    return { ok: false, message: 'Only checked-in reservations can be checked out.' };
  }

  if (state.roomStatus !== 'occupied') {
    return { ok: false, message: 'Checkout expects the room to be occupied.' };
  }

  if (state.outstandingBalance > 0 && !state.confirmedBalanceDue) {
    return { ok: false, message: 'Outstanding balance requires confirmation before checkout.' };
  }

  return { ok: true };
}

export function mapCheckoutRpcRow(row: CheckoutRpcRow): CheckoutResult {
  return {
    ok: row.ok,
    message: row.message,
    bookingReference: row.booking_reference ?? undefined,
    guestName: row.guest_name ?? undefined,
    roomNumber: row.room_number ?? undefined,
    outstandingBalance: toNumber(row.outstanding_balance),
    housekeepingTaskId: row.housekeeping_task_id ?? undefined
  };
}

export async function checkoutReservation(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  reservationId: string,
  confirmedBalanceDue: boolean
): Promise<CheckoutResult> {
  if (!reservationId) {
    return { ok: false, message: 'Select a reservation to check out.', outstandingBalance: 0 };
  }

  if (!access.hotel_id || !isAuthorizedCheckoutRole(access.role)) {
    return { ok: false, message: 'You are not authorised to check out reservations.', outstandingBalance: 0 };
  }

  const response = await supabase
    .rpc('checkout_reservation', {
      p_reservation_id: reservationId,
      p_confirm_balance_due: confirmedBalanceDue
    })
    .single<CheckoutRpcRow>();

  if (response.error) {
    return { ok: false, message: `Unable to check out reservation: ${response.error.message}`, outstandingBalance: 0 };
  }

  return mapCheckoutRpcRow(response.data);
}
