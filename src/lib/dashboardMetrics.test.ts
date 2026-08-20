import { describe, expect, it } from 'vitest';
import { demoDashboardData } from './mockData';
import { getDashboardStats, getExpectedRoomRevenue, getOccupancyRate } from './dashboardMetrics';

describe('dashboard metrics', () => {
  it('calculates occupancy from occupied rooms only', () => {
    expect(getOccupancyRate(demoDashboardData.rooms)).toBe(33);
  });

  it('totals expected active nightly revenue', () => {
    expect(getExpectedRoomRevenue(demoDashboardData.reservations)).toBe(165000);
  });

  it('summarizes the core hotel dashboard', () => {
    expect(getDashboardStats(demoDashboardData)).toMatchObject({
      occupancyRate: 33,
      availableRooms: 1,
      arrivals: 1,
      departures: 1,
      openHousekeeping: 3,
      expectedRoomRevenue: 165000
    });
  });
});
