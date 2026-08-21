import { describe, expect, it } from 'vitest';
import { isAuthorizedCheckoutRole, mapCheckoutRpcRow, validateCheckoutState, type CheckoutReservationState } from './checkout';

const checkoutState: CheckoutReservationState = {
  accessHotelId: 'hotel-1',
  role: 'owner',
  reservationHotelId: 'hotel-1',
  roomHotelId: 'hotel-1',
  reservationStatus: 'checked_in',
  roomStatus: 'occupied',
  outstandingBalance: 0,
  confirmedBalanceDue: false
};

describe('checkout workflow rules', () => {
  it('allows successful checkout with zero balance', () => {
    expect(validateCheckoutState(checkoutState)).toEqual({ ok: true });
    expect(mapCheckoutRpcRow({
      ok: true,
      message: 'Reservation checked out.',
      booking_reference: '3DH-20260820-D44C',
      guest_name: 'Guest One',
      room_number: '101',
      outstanding_balance: 0,
      housekeeping_task_id: 'task-1'
    })).toMatchObject({ ok: true, outstandingBalance: 0, housekeepingTaskId: 'task-1' });
  });

  it('requires explicit confirmation when checkout has an outstanding balance', () => {
    expect(validateCheckoutState({ ...checkoutState, outstandingBalance: 50000 })).toMatchObject({
      ok: false,
      message: 'Outstanding balance requires confirmation before checkout.'
    });
  });

  it('allows checkout with outstanding balance only after confirmation', () => {
    expect(validateCheckoutState({ ...checkoutState, outstandingBalance: 50000, confirmedBalanceDue: true })).toEqual({ ok: true });
  });

  it('rejects non-checked-in reservations and duplicate checkout attempts', () => {
    expect(validateCheckoutState({ ...checkoutState, reservationStatus: 'confirmed' })).toMatchObject({ ok: false });
    expect(validateCheckoutState({ ...checkoutState, reservationStatus: 'checked_out' })).toMatchObject({ ok: false });
  });

  it('rejects cross-hotel checkout', () => {
    expect(validateCheckoutState({ ...checkoutState, reservationHotelId: 'hotel-2' })).toMatchObject({ ok: false });
    expect(validateCheckoutState({ ...checkoutState, roomHotelId: 'hotel-2' })).toMatchObject({ ok: false });
  });

  it('rejects unauthorised users', () => {
    expect(isAuthorizedCheckoutRole('owner')).toBe(true);
    expect(isAuthorizedCheckoutRole('front_desk')).toBe(true);
    expect(isAuthorizedCheckoutRole('housekeeping')).toBe(false);
    expect(validateCheckoutState({ ...checkoutState, role: 'housekeeping' })).toMatchObject({ ok: false });
  });

  it('requires the checked-in room to still be occupied', () => {
    expect(validateCheckoutState({ ...checkoutState, roomStatus: 'available' })).toMatchObject({ ok: false });
  });
});
