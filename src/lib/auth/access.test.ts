import { describe, expect, it } from 'vitest';
import { evaluateDashboardAccess, type HotelRecord, type StaffProfileRecord } from './access';

const user = { id: 'auth-user-id' };
const hotel: HotelRecord = {
  id: 'hotel-3dhotels',
  slug: '3dhotels',
  name: '3dHotels'
};
const ownerProfile: StaffProfileRecord = {
  id: user.id,
  hotel_id: hotel.id,
  full_name: 'Owner User',
  role: 'owner',
  is_active: true
};

describe('owner dashboard access', () => {
  it('allows an authorised active owner profile for 3dHotels', () => {
    expect(evaluateDashboardAccess(user, ownerProfile, hotel)).toMatchObject({
      status: 'authorized',
      profile: ownerProfile,
      hotel
    });
  });

  it('denies an authenticated user with no staff profile', () => {
    expect(evaluateDashboardAccess(user, null, null)).toMatchObject({
      status: 'no_profile',
      message: 'Account not authorised for this hotel.'
    });
  });

  it('denies an inactive staff member', () => {
    expect(evaluateDashboardAccess(user, { ...ownerProfile, is_active: false }, hotel)).toMatchObject({
      status: 'inactive',
      message: 'This staff account is inactive.'
    });
  });

  it('denies unauthenticated dashboard access', () => {
    expect(evaluateDashboardAccess(null, null, null)).toMatchObject({
      status: 'unauthenticated',
      message: 'Please sign in to continue.'
    });
  });
});
