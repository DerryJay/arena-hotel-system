import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardData, HousekeepingStatus, ReservationStatus, RoomStatus } from './types';
import type { StaffHotelAccessRecord } from './auth/access';

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

type AmountRow = {
  reservation_id: string;
  amount: number | string;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

function sumAmountsByReservation(rows: AmountRow[]): Map<string, number> {
  return rows.reduce((amounts, row) => {
    amounts.set(row.reservation_id, (amounts.get(row.reservation_id) ?? 0) + toNumber(row.amount));
    return amounts;
  }, new Map<string, number>());
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
      .select('id, status, check_in, check_out, nightly_rate, rooms(room_number), guests(full_name)')
      .eq('hotel_id', hotelId)
      .order('check_in', { ascending: true }),
    supabase
      .from('housekeeping_tasks')
      .select('id, status, due_on, notes, rooms(room_number)')
      .eq('hotel_id', hotelId)
      .order('due_on', { ascending: true })
  ]);

  if (roomsResponse.error) {
    throw new Error(`Unable to load rooms: ${roomsResponse.error.message}`);
  }

  if (reservationsResponse.error) {
    throw new Error(`Unable to load reservations: ${reservationsResponse.error.message}`);
  }

  if (housekeepingResponse.error) {
    throw new Error(`Unable to load housekeeping tasks: ${housekeepingResponse.error.message}`);
  }

  const reservationRows = (reservationsResponse.data ?? []) as unknown as ReservationRow[];
  const reservationIds = reservationRows.map((reservation) => reservation.id);
  let chargeTotals = new Map<string, number>();
  let paymentTotals = new Map<string, number>();

  if (reservationIds.length > 0) {
    const [chargesResponse, paymentsResponse] = await Promise.all([
      supabase.from('folio_charges').select('reservation_id, amount').eq('hotel_id', hotelId).in('reservation_id', reservationIds),
      supabase.from('payments').select('reservation_id, amount').eq('hotel_id', hotelId).in('reservation_id', reservationIds)
    ]);

    if (chargesResponse.error) {
      throw new Error(`Unable to load folio charges: ${chargesResponse.error.message}`);
    }

    if (paymentsResponse.error) {
      throw new Error(`Unable to load payments: ${paymentsResponse.error.message}`);
    }

    chargeTotals = sumAmountsByReservation((chargesResponse.data ?? []) as unknown as AmountRow[]);
    paymentTotals = sumAmountsByReservation((paymentsResponse.data ?? []) as unknown as AmountRow[]);
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
    reservations: reservationRows.map((reservation) => ({
      id: reservation.id,
      roomNumber: reservation.rooms?.room_number ?? 'Unassigned',
      guestName: reservation.guests?.full_name ?? 'Unknown guest',
      status: reservation.status,
      checkIn: reservation.check_in,
      checkOut: reservation.check_out,
      nightlyRate: toNumber(reservation.nightly_rate),
      balance: Math.max(0, (chargeTotals.get(reservation.id) ?? 0) - (paymentTotals.get(reservation.id) ?? 0))
    })),
    housekeeping: ((housekeepingResponse.data ?? []) as unknown as HousekeepingRow[]).map((task) => ({
      id: task.id,
      roomNumber: task.rooms?.room_number ?? 'Unassigned',
      status: task.status,
      dueOn: task.due_on,
      notes: task.notes ?? ''
    }))
  };
}
