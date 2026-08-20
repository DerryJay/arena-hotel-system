import { describe, expect, it } from 'vitest';
import {
  datesOverlap,
  filterAvailableRooms,
  getStayNights,
  isAuthorizedBookingRole,
  normalizeBookingSource,
  validateBookingInput,
  type BookingRoomOption,
  type ExistingInventoryReservation
} from './booking';

const rooms: BookingRoomOption[] = [
  { id: 'room-101', roomNumber: '101', roomTypeId: 'standard', roomTypeName: 'Standard', baseRate: 25000, status: 'available' },
  { id: 'room-102', roomNumber: '102', roomTypeId: 'standard', roomTypeName: 'Standard', baseRate: 25000, status: 'maintenance' },
  { id: 'room-103', roomNumber: '103', roomTypeId: 'standard', roomTypeName: 'Standard', baseRate: 25000, status: 'blocked' },
  { id: 'room-201', roomNumber: '201', roomTypeId: 'deluxe', roomTypeName: 'Deluxe', baseRate: 35000, status: 'available' }
];

const overlappingReservation: ExistingInventoryReservation = {
  room_id: 'room-101',
  check_in: '2026-09-10',
  check_out: '2026-09-12',
  status: 'confirmed'
};

describe('booking workflow rules', () => {
  it('allows a successful booking-shaped request', () => {
    expect(validateBookingInput({
      guestName: 'Chibuike Edeani',
      phone: '+234070239004',
      checkIn: '2026-09-12',
      checkOut: '2026-09-14',
      adults: 1,
      selectedRoomId: 'room-101'
    })).toEqual({ ok: true, errors: [] });
    expect(getStayNights('2026-09-12', '2026-09-14')).toBe(2);
  });

  it('rejects overlapping bookings for the same room', () => {
    expect(datesOverlap('2026-09-10', '2026-09-12', '2026-09-11', '2026-09-13')).toBe(true);
    expect(filterAvailableRooms(rooms, [overlappingReservation], '2026-09-11', '2026-09-13').map((room) => room.id)).not.toContain('room-101');
  });

  it('allows back-to-back bookings', () => {
    expect(datesOverlap('2026-09-10', '2026-09-12', '2026-09-12', '2026-09-14')).toBe(false);
    expect(filterAvailableRooms(rooms, [overlappingReservation], '2026-09-12', '2026-09-14').map((room) => room.id)).toContain('room-101');
  });

  it('excludes maintenance rooms', () => {
    expect(filterAvailableRooms(rooms, [], '2026-09-12', '2026-09-14').map((room) => room.id)).not.toContain('room-102');
  });

  it('excludes blocked rooms', () => {
    expect(filterAvailableRooms(rooms, [], '2026-09-12', '2026-09-14').map((room) => room.id)).not.toContain('room-103');
  });

  it('rejects invalid dates and invalid adult count', () => {
    const result = validateBookingInput({
      guestName: 'Guest',
      phone: '+234070239004',
      checkIn: '2026-09-14',
      checkOut: '2026-09-12',
      adults: 0,
      selectedRoomId: 'room-101'
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('Check-out must be after check-in.');
    expect(result.errors).toContain('Adults must be at least 1.');
  });

  it('rejects unauthorised users', () => {
    expect(isAuthorizedBookingRole('housekeeping')).toBe(false);
    expect(isAuthorizedBookingRole('accounting')).toBe(false);
    expect(isAuthorizedBookingRole('manager')).toBe(false);
  });

  it('allows only hotel operations roles so cross-hotel creation cannot be client-selected', () => {
    expect(isAuthorizedBookingRole('owner')).toBe(true);
    expect(isAuthorizedBookingRole('front_desk')).toBe(true);
    expect(normalizeBookingSource('walk_in')).toBe('walk_in');
    expect(normalizeBookingSource('invalid_source')).toBe('front_desk');
  });
});
