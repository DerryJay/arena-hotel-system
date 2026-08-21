import { describe, expect, it } from 'vitest';
import {
  getDashboardStats,
  getExpectedRoomRevenue,
  getOccupancyRate,
  getPaymentsReceived,
  getReservationStayValue
} from './dashboardMetrics';
import type { DashboardData } from './types';

const dashboardData: DashboardData = {
  hotel: {
    id: 'hotel-1',
    name: '3dHotels',
    timezone: 'Africa/Lagos'
  },
  rooms: [
    { id: '101', roomNumber: '101', floor: '1', typeName: 'Standard', status: 'occupied', nightlyRate: 25000 },
    { id: '102', roomNumber: '102', floor: '1', typeName: 'Standard', status: 'available', nightlyRate: 25000 },
    { id: '103', roomNumber: '103', floor: '1', typeName: 'Standard', status: 'cleaning', nightlyRate: 25000 },
    { id: '201', roomNumber: '201', floor: '2', typeName: 'Deluxe', status: 'occupied', nightlyRate: 35000 }
  ],
  reservations: [
    {
      id: 'res-1',
      bookingReference: '3DH-20260820-D44C',
      roomNumber: '101',
      guestName: 'Guest One',
      status: 'checked_in',
      checkIn: '2026-09-09',
      checkOut: '2026-09-10',
      nightlyRate: 25000,
      totalStayValue: 25000,
      amountPaid: 25000,
      balance: 0
    },
    {
      id: 'res-2',
      bookingReference: '3DH-20260820-A123',
      roomNumber: '201',
      guestName: 'Guest Two',
      status: 'reserved',
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      nightlyRate: 35000,
      totalStayValue: 70000,
      amountPaid: 30000,
      balance: 40000
    },
    {
      id: 'res-3',
      roomNumber: '102',
      guestName: 'Guest Three',
      status: 'cancelled',
      checkIn: '2026-09-10',
      checkOut: '2026-09-11',
      nightlyRate: 25000,
      totalStayValue: 25000,
      amountPaid: 0,
      balance: 25000
    }
  ],
  housekeeping: [
    { id: 'hk-1', roomNumber: '102', status: 'todo', dueOn: '2026-09-10', notes: '' },
    { id: 'hk-2', roomNumber: '201', status: 'verified', dueOn: '2026-09-10', notes: '' }
  ]
};

describe('dashboard metrics', () => {
  it('calculates occupancy from occupied rooms only', () => {
    expect(getOccupancyRate(dashboardData.rooms)).toBe(50);
  });

  it('calculates reservation stay value from dates and nightly rate', () => {
    expect(getReservationStayValue({ checkIn: '2026-09-10', checkOut: '2026-09-13', nightlyRate: 25000 })).toBe(75000);
  });

  it('totals active stay value separately from recorded payments', () => {
    expect(getExpectedRoomRevenue(dashboardData.reservations)).toBe(95000);
    expect(getPaymentsReceived(dashboardData.reservations)).toBe(55000);
  });

  it('summarizes the core hotel dashboard for the operating date', () => {
    expect(getDashboardStats(dashboardData, '2026-09-10')).toMatchObject({
      occupancyRate: 50,
      availableRooms: 1,
      arrivals: 1,
      departures: 1,
      openHousekeeping: 1,
      activeStayValue: 95000,
      paymentsReceived: 55000,
      expectedRoomRevenue: 95000
    });
  });

  it('shows zero stats when there are no reservations or cleaning rooms', () => {
    const availableRooms = dashboardData.rooms.map((room) => ({ ...room, status: room.status === 'cleaning' ? 'available' as const : room.status }));

    expect(getDashboardStats({ ...dashboardData, rooms: availableRooms, reservations: [], housekeeping: [] }, '2026-09-10')).toMatchObject({
      arrivals: 0,
      departures: 0,
      openHousekeeping: 0,
      activeStayValue: 0,
      paymentsReceived: 0,
      expectedRoomRevenue: 0
    });
  });
});
