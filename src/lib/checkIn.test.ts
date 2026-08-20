import { describe, expect, it } from 'vitest';
import { isAuthorizedCheckInRole, mapCheckInRpcRow, validateCheckInState, type CheckInReservationState } from './checkIn';
import type { StaffHotelAccessRecord } from './auth/access';

const ownerAccess: StaffHotelAccessRecord = {
  id: 'staff-1',
  hotel_id: 'hotel-1',
  full_name: 'Chibuike Edeani',
  role: 'owner',
  is_active: true,
  hotel_slug: '3dhotels',
  hotel_name: '3dHotels'
};

const eligibleState: CheckInReservationState = {
  reservationHotelId: 'hotel-1',
  roomHotelId: 'hotel-1',
  reservationStatus: 'confirmed',
  roomStatus: 'available',
  checkIn: '2099-09-10'
};

describe('check-in workflow rules', () => {
  it('allows a successful check-in for authorised hotel staff', () => {
    expect(validateCheckInState(ownerAccess, { ...eligibleState, checkIn: '2026-08-20' })).toEqual({ ok: true, earlyCheckIn: false });
  });

  it('returns an early check-in warning without changing dates', () => {
    expect(validateCheckInState(ownerAccess, eligibleState)).toEqual({ ok: true, earlyCheckIn: true });
    expect(mapCheckInRpcRow({
      ok: true,
      message: 'Checked in early. Reservation dates were not changed.',
      booking_reference: '3DH-20260820-D44C',
      guest_name: 'Guest One',
      room_number: '101',
      reservation_status: 'checked_in',
      early_check_in: true
    })).toMatchObject({ earlyCheckIn: true, bookingReference: '3DH-20260820-D44C' });
  });

  it('rejects cancelled reservations', () => {
    expect(validateCheckInState(ownerAccess, { ...eligibleState, reservationStatus: 'cancelled' })).toMatchObject({ ok: false });
  });

  it('rejects checked-out reservations', () => {
    expect(validateCheckInState(ownerAccess, { ...eligibleState, reservationStatus: 'checked_out' })).toMatchObject({ ok: false });
  });

  it('rejects maintenance rooms', () => {
    expect(validateCheckInState(ownerAccess, { ...eligibleState, roomStatus: 'maintenance' })).toMatchObject({ ok: false });
  });

  it('rejects blocked rooms', () => {
    expect(validateCheckInState(ownerAccess, { ...eligibleState, roomStatus: 'blocked' })).toMatchObject({ ok: false });
  });

  it('rejects unauthorised users', () => {
    expect(isAuthorizedCheckInRole('housekeeping')).toBe(false);
    expect(validateCheckInState({ ...ownerAccess, role: 'housekeeping' }, eligibleState)).toMatchObject({ ok: false });
  });

  it('prevents cross-hotel check-in actions', () => {
    expect(validateCheckInState(ownerAccess, { ...eligibleState, reservationHotelId: 'hotel-2' })).toMatchObject({ ok: false });
    expect(validateCheckInState(ownerAccess, { ...eligibleState, roomHotelId: 'hotel-2' })).toMatchObject({ ok: false });
  });
});
