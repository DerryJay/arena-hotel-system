import type { DashboardData, Reservation, Room } from './types';

const activeReservationStatuses = new Set(['reserved', 'confirmed', 'checked_in']);
const departureReservationStatuses = new Set(['checked_in', 'checked_out']);

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0
  }).format(amount);
}

export function getStayNights(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
}

export function getReservationStayValue(reservation: Pick<Reservation, 'checkIn' | 'checkOut' | 'nightlyRate'>): number {
  return getStayNights(reservation.checkIn, reservation.checkOut) * reservation.nightlyRate;
}

export function getOccupancyRate(rooms: Room[]): number {
  if (rooms.length === 0) {
    return 0;
  }

  const occupiedRooms = rooms.filter((room) => room.status === 'occupied').length;
  return Math.round((occupiedRooms / rooms.length) * 100);
}

export function getActiveStayValue(reservations: Reservation[]): number {
  return reservations
    .filter((reservation) => activeReservationStatuses.has(reservation.status))
    .reduce((total, reservation) => total + reservation.totalStayValue, 0);
}

export function getPaymentsReceived(reservations: Reservation[]): number {
  return reservations.reduce((total, reservation) => total + reservation.amountPaid, 0);
}

export function getExpectedRoomRevenue(reservations: Reservation[]): number {
  return getActiveStayValue(reservations);
}

export function getDashboardStats(data: DashboardData, operatingDate = new Date().toISOString().slice(0, 10)) {
  const arrivals = data.reservations.filter(
    (reservation) => reservation.checkIn === operatingDate && activeReservationStatuses.has(reservation.status)
  ).length;
  const departures = data.reservations.filter(
    (reservation) => reservation.checkOut === operatingDate && departureReservationStatuses.has(reservation.status)
  ).length;
  const openHousekeeping = data.housekeeping.filter((task) => task.status !== 'verified').length;

  return {
    occupancyRate: getOccupancyRate(data.rooms),
    availableRooms: data.rooms.filter((room) => room.status === 'available').length,
    arrivals,
    departures,
    openHousekeeping,
    activeStayValue: getActiveStayValue(data.reservations),
    paymentsReceived: getPaymentsReceived(data.reservations),
    expectedRoomRevenue: getActiveStayValue(data.reservations)
  };
}
