import { describe, expect, it } from 'vitest';
import {
  getReservationPaymentStatus,
  getValidPaymentTotal,
  isAuthorizedPaymentRecorder,
  normalizePaymentMethod,
  validatePaymentInput,
  validatePaymentSafety
} from './reservations';

describe('reservations and payment rules', () => {
  it('calculates unpaid reservations', () => {
    expect(getReservationPaymentStatus(75000, 0)).toBe('unpaid');
    expect(getValidPaymentTotal([])).toBe(0);
  });

  it('calculates partially paid reservations', () => {
    expect(getReservationPaymentStatus(75000, 25000)).toBe('part_paid');
  });

  it('calculates fully paid reservations', () => {
    expect(getReservationPaymentStatus(75000, 75000)).toBe('paid');
    expect(getReservationPaymentStatus(75000, 90000)).toBe('paid');
  });

  it('counts only valid received payment statuses', () => {
    expect(getValidPaymentTotal([
      { amount: 25000, status: 'paid' },
      { amount: 10000, status: 'partially_paid' },
      { amount: 5000, status: 'refunded' },
      { amount: 7000, status: 'void' }
    ])).toBe(35000);
  });

  it('allows successful payment recording input', () => {
    expect(validatePaymentInput({
      reservationId: 'res-1',
      amount: 25000,
      method: 'bank_transfer',
      reference: 'TX-1',
      notes: 'Deposit',
      idempotencyKey: 'key-1'
    })).toEqual({ ok: true, method: 'bank_transfer' });
  });

  it('rejects invalid or negative payments', () => {
    expect(validatePaymentInput({ reservationId: 'res-1', amount: 0, method: 'cash', idempotencyKey: 'key-1' })).toMatchObject({ ok: false });
    expect(validatePaymentInput({ reservationId: 'res-1', amount: -1, method: 'cash', idempotencyKey: 'key-1' })).toMatchObject({ ok: false });
    expect(normalizePaymentMethod('cheque')).toBeNull();
  });

  it('rejects unauthorised users', () => {
    expect(isAuthorizedPaymentRecorder('owner')).toBe(true);
    expect(isAuthorizedPaymentRecorder('front_desk')).toBe(true);
    expect(isAuthorizedPaymentRecorder('housekeeping')).toBe(false);
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'housekeeping', reservationHotelId: 'hotel-1', amount: 1000, idempotencyKey: 'key-1' })).toMatchObject({ ok: false });
  });

  it('prevents cross-hotel payment attempts', () => {
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'owner', reservationHotelId: 'hotel-2', amount: 1000, idempotencyKey: 'key-1' })).toMatchObject({ ok: false });
  });

  it('requires duplicate-submission protection keys', () => {
    expect(validatePaymentInput({ reservationId: 'res-1', amount: 1000, method: 'cash', idempotencyKey: '' })).toMatchObject({ ok: false });
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'owner', reservationHotelId: 'hotel-1', amount: 1000, idempotencyKey: '' })).toMatchObject({ ok: false });
  });
});
