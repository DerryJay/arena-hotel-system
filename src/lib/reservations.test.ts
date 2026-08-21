import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getReservationPaymentStatus,
  getValidPaymentTotal,
  isAuthorizedPaymentRecorder,
  normalizePaymentMethod,
  validatePaymentInput,
  validatePaymentSafety
} from './reservations';

const reservationsComponentSource = readFileSync(join(process.cwd(), 'src', 'components', 'ReservationsManagement.tsx'), 'utf8');

describe('reservations and payment rules', () => {
  it('uses whole-naira browser validation for the payment amount input', () => {
    expect(reservationsComponentSource).toContain('name="amount" type="number" min="1"');
    expect(reservationsComponentSource).toContain('step="1"');
    expect(reservationsComponentSource).not.toContain('step="100"');
  });

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

  it('allows successful whole-naira payment recording input', () => {
    expect(validatePaymentInput({
      reservationId: 'res-1',
      amount: 25000,
      method: 'bank_transfer',
      reference: 'TX-1',
      notes: 'Deposit',
      idempotencyKey: 'key-1',
      outstandingBalance: 50000
    })).toEqual({ ok: true, method: 'bank_transfer' });
  });

  it('rejects zero, negative and overpayment amounts', () => {
    expect(validatePaymentInput({ reservationId: 'res-1', amount: 0, method: 'cash', idempotencyKey: 'key-1', outstandingBalance: 50000 })).toMatchObject({ ok: false });
    expect(validatePaymentInput({ reservationId: 'res-1', amount: -1, method: 'cash', idempotencyKey: 'key-1', outstandingBalance: 50000 })).toMatchObject({ ok: false });
    expect(validatePaymentInput({ reservationId: 'res-1', amount: 50001, method: 'cash', idempotencyKey: 'key-1', outstandingBalance: 50000 })).toMatchObject({ ok: false });
    expect(normalizePaymentMethod('cheque')).toBeNull();
  });

  it('rejects unauthorised users', () => {
    expect(isAuthorizedPaymentRecorder('owner')).toBe(true);
    expect(isAuthorizedPaymentRecorder('front_desk')).toBe(true);
    expect(isAuthorizedPaymentRecorder('housekeeping')).toBe(false);
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'housekeeping', reservationHotelId: 'hotel-1', amount: 1000, idempotencyKey: 'key-1', outstandingBalance: 50000 })).toMatchObject({ ok: false });
  });

  it('prevents cross-hotel payment attempts', () => {
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'owner', reservationHotelId: 'hotel-2', amount: 1000, idempotencyKey: 'key-1', outstandingBalance: 50000 })).toMatchObject({ ok: false });
  });

  it('prevents payment safety overpayments', () => {
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'owner', reservationHotelId: 'hotel-1', amount: 50001, idempotencyKey: 'key-1', outstandingBalance: 50000 })).toMatchObject({ ok: false });
  });

  it('requires duplicate-submission protection keys', () => {
    expect(validatePaymentInput({ reservationId: 'res-1', amount: 1000, method: 'cash', idempotencyKey: '', outstandingBalance: 50000 })).toMatchObject({ ok: false });
    expect(validatePaymentSafety({ accessHotelId: 'hotel-1', role: 'owner', reservationHotelId: 'hotel-1', amount: 1000, idempotencyKey: '', outstandingBalance: 50000 })).toMatchObject({ ok: false });
  });
});
