import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { DashboardData, HousekeepingStatus, PaymentStatus, ReservationStatus, RoomStatus } from './types';
import type { StaffHotelAccessRecord } from './auth/access';
import { getReservationStayValue } from './dashboardMetrics';

type RoomRow = {
  id: string;
  room_number: string;
  floor: string | null;
  status: RoomStatus;
  room_types: {
    name: string;
    base_rate: number | string;
  } | null;
};

type ReservationRow = {
  id: string;
  booking_reference: string | null;
  status: ReservationStatus;
  check_in: string;
  check_out: string;
  nightly_rate: number | string;
  rooms: {
    room_number: string;
  } | null;
  guests: {
    full_name: string;
  } | null;
};

type HousekeepingRow = {
  id: string;
  status: HousekeepingStatus;
  due_on: string;
  notes: string | null;
  rooms: {
    room_number: string;
  } | null;
};

type PaymentAmountRow = {
  reservation_id: string;
  amount: number | string;
  status: PaymentStatus;
};

const validPaymentStatuses = new Set<PaymentStatus>(['paid', 'partially_paid']);

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

function sumPaymentsByReservation(rows: PaymentAmountRow[]): Map<string, number> {
  return rows.reduce((amounts, row) => {
    if (validPaymentStatuses.has(row.status)) {
      amounts.set(row.reservation_id, (amounts.get(row.reservation_id) ?? 0) + toNumber(row.amount));
    }

    return amounts;
  }, new Map<string, number>());
}

function logDashboardQueryError(source: string, error: PostgrestError): void {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.error('[dashboard:data]', {
    source,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint
  });
}

function throwDashboardQueryError(source: string, error: PostgrestError): never {
  logDashboardQueryError(source, error);
  throw new Error(`Unable to load ${source}: ${error.message}`);
}

export async function getLiveDashboardData(supabase: SupabaseClient, access: StaffHotelAccessRecord): Promise<DashboardData> {
  if (!access.hotel_id) {
    throw new Error('Authenticated staff profile is missing a hotel id.');
  }

  const hotelId = access.hotel_id;

  const [roomsResponse, reservationsResponse, housekeepingResponse] = await Promise.all([
    supabase
      .from('rooms')
      .select('id, room_number, floor, status, room_types(name, base_rate)')
      .eq('hotel_id', hotelId)
      .order('room_number', { ascending: true }),
    supabase
      .from('reservations')
      .select('id, booking_reference, status, check_in, check_out, nightly_rate, rooms(room_number), guests(full_name)')
      .eq('hotel_id', hotelId)
      .order('check_in', { ascending: true }),
    supabase
      .from('housekeeping_tasks')
      .select('id, status, due_on, notes, rooms(room_number)')
      .eq('hotel_id', hotelId)
      .order('due_on', { ascending: true })
  ]);

  if (roomsResponse.error) {
    throwDashboardQueryError('rooms', roomsResponse.error);
  }

  if (reservationsResponse.error) {
    throwDashboardQueryError('reservations', reservationsResponse.error);
  }

  if (housekeepingResponse.error) {
    throwDashboardQueryError('housekeeping tasks', housekeepingResponse.error);
  }

  const reservationRows = (reservationsResponse.data ?? []) as unknown as ReservationRow[];
  const reservationIds = reservationRows.map((reservation) => reservation.id);
  let paymentTotals = new Map<string, number>();

  if (reservationIds.length > 0) {
    const paymentsResponse = await supabase
      .from('payments')
      .select('reservation_id, amount, status')
      .eq('hotel_id', hotelId)
      .in('reservation_id', reservationIds);

    if (paymentsResponse.error) {
      throwDashboardQueryError('payments', paymentsResponse.error);
    }

    paymentTotals = sumPaymentsByReservation((paymentsResponse.data ?? []) as unknown as PaymentAmountRow[]);
  }

  return {
    hotel: {
      id: hotelId,
      name: access.hotel_name ?? '3dHotels',
      timezone: 'Africa/Lagos'
    },
    rooms: ((roomsResponse.data ?? []) as unknown as RoomRow[]).map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      floor: room.floor ?? '',
      typeName: room.room_types?.name ?? 'Unassigned',
      status: room.status,
      nightlyRate: toNumber(room.room_types?.base_rate)
    })),
    reservations: reservationRows.map((reservation) => {
      const nightlyRate = toNumber(reservation.nightly_rate);
      const totalStayValue = getReservationStayValue({
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        nightlyRate
      });
      const amountPaid = paymentTotals.get(reservation.id) ?? 0;

      return {
        id: reservation.id,
        bookingReference: reservation.booking_reference ?? undefined,
        roomNumber: reservation.rooms?.room_number ?? 'Unassigned',
        guestName: reservation.guests?.full_name ?? 'Unknown guest',
        status: reservation.status,
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        nightlyRate,
        totalStayValue,
        amountPaid,
        balance: Math.max(0, totalStayValue - amountPaid)
      };
    }),
    housekeeping: ((housekeepingResponse.data ?? []) as unknown as HousekeepingRow[]).map((task) => ({
      id: task.id,
      roomNumber: task.rooms?.room_number ?? 'Unassigned',
      status: task.status,
      dueOn: task.due_on,
      notes: task.notes ?? ''
    }))
  };
}
