import { describe, expect, it } from 'vitest';
import { wouldDoubleBook, type InventoryReservation } from './bookingRules';

const baseReservation: InventoryReservation = {
  roomId: 'room-101',
  checkIn: '2026-09-10',
  checkOut: '2026-09-12',
  status: 'reserved'
};

function nextReservation(overrides: Partial<InventoryReservation>): InventoryReservation {
  return {
    roomId: 'room-101',
    checkIn: '2026-09-11',
    checkOut: '2026-09-13',
    status: 'reserved',
    ...overrides
  };
}

describe('booking inventory rules', () => {
  it('rejects Sep 10-12 plus Sep 11-13 for the same room', () => {
    expect(wouldDoubleBook(baseReservation, nextReservation({}))).toBe(true);
  });

  it('allows Sep 10-12 plus Sep 12-14 for the same room', () => {
    expect(wouldDoubleBook(baseReservation, nextReservation({ checkIn: '2026-09-12', checkOut: '2026-09-14' }))).toBe(false);
  });

  it('allows an overlapping booking on another room', () => {
    expect(wouldDoubleBook(baseReservation, nextReservation({ roomId: 'room-202' }))).toBe(false);
  });

  it('does not let a cancelled reservation block inventory', () => {
    expect(wouldDoubleBook({ ...baseReservation, status: 'cancelled' }, nextReservation({}))).toBe(false);
  });

  it('does not let a checked-out reservation block future inventory', () => {
    expect(wouldDoubleBook({ ...baseReservation, status: 'checked_out' }, nextReservation({}))).toBe(false);
  });
});
