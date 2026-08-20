import { describe, expect, it } from 'vitest';
import { evaluateDashboardAccess, type StaffHotelAccessRecord } from './access';

const user = { id: 'auth-user-id' };
const ownerAccess: StaffHotelAccessRecord = {
  id: user.id,
  hotel_id: 'hotel-3dhotels',
  full_name: 'Owner User',
  role: 'owner',
  is_active: true,
  hotel_slug: '3dhotels',
  hotel_name: '3dHotels'
};

describe('owner dashboard access', () => {
  it('allows an authorised active owner profile for 3dHotels', () => {
    expect(evaluateDashboardAccess(user, ownerAccess)).toMatchObject({
      status: 'authorized',
      access: ownerAccess
    });
  });

  it('denies an authenticated user with no staff profile', () => {
    expect(evaluateDashboardAccess(user, null)).toMatchObject({
      status: 'no_profile',
      message: 'Account not authorised for this hotel.'
    });
  });

  it('denies an inactive staff member', () => {
    expect(evaluateDashboardAccess(user, { ...ownerAccess, is_active: false })).toMatchObject({
      status: 'inactive',
      message: 'This staff account is inactive.'
    });
  });

  it('denies unauthenticated dashboard access', () => {
    expect(evaluateDashboardAccess(null, null)).toMatchObject({
      status: 'unauthenticated',
      message: 'Please sign in to continue.'
    });
  });

  it('fails closed when the server cannot verify staff access', () => {
    expect(evaluateDashboardAccess(user, null, true)).toMatchObject({
      status: 'lookup_failed',
      message: 'Account authorisation could not be verified.'
    });
  });
});
