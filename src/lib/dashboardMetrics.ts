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

export function getOccupancyRate(rooms: Room[]): number {
  if (rooms.length === 0) {
    return 0;
  }

  const occupiedRooms = rooms.filter((room) => room.status === 'occupied').length;
  return Math.round((occupiedRooms / rooms.length) * 100);
}

export function getExpectedRoomRevenue(reservations: Reservation[]): number {
  return reservations
    .filter((reservation) => activeReservationStatuses.has(reservation.status))
    .reduce((total, reservation) => total + reservation.nightlyRate, 0);
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
    expectedRoomRevenue: getExpectedRoomRevenue(data.reservations)
  };
}
