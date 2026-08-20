export type RoomStatus = 'available' | 'occupied' | 'reserved' | 'cleaning' | 'maintenance' | 'blocked';
export type ReservationStatus = 'pending' | 'reserved' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type HousekeepingStatus = 'todo' | 'in_progress' | 'done' | 'verified';
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'refunded' | 'void';

export interface Hotel {
  id: string;
  name: string;
  timezone: string;
}

export interface Room {
  id: string;
  roomNumber: string;
  floor: string;
  typeName: string;
  status: RoomStatus;
  nightlyRate: number;
}

export interface Guest {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
}

export interface Reservation {
  id: string;
  roomNumber: string;
  guestName: string;
  status: ReservationStatus;
  checkIn: string;
  checkOut: string;
  nightlyRate: number;
  balance: number;
}

export interface HousekeepingTask {
  id: string;
  roomNumber: string;
  status: HousekeepingStatus;
  dueOn: string;
  notes: string;
}

export interface DashboardData {
  hotel: Hotel;
  rooms: Room[];
  reservations: Reservation[];
  housekeeping: HousekeepingTask[];
}
