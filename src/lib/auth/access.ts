import type { User } from '@supabase/supabase-js';

export const authorisedHotelSlug = '3dhotels';

export interface StaffHotelAccessRecord {
  id: string;
  hotel_id: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
  hotel_slug: string | null;
  hotel_name: string | null;
}

export type DashboardAccessResult =
  | { status: 'authorized'; access: StaffHotelAccessRecord }
  | { status: 'unauthenticated'; message: string }
  | { status: 'no_profile'; message: string }
  | { status: 'inactive'; message: string }
  | { status: 'wrong_hotel'; message: string }
  | { status: 'wrong_role'; message: string }
  | { status: 'lookup_failed'; message: string };

export function evaluateDashboardAccess(
  user: Pick<User, 'id'> | null,
  access: StaffHotelAccessRecord | null,
  lookupFailed = false
): DashboardAccessResult {
  if (!user) {
    return { status: 'unauthenticated', message: 'Please sign in to continue.' };
  }

  if (lookupFailed) {
    return { status: 'lookup_failed', message: 'Account authorisation could not be verified.' };
  }

  if (!access) {
    return { status: 'no_profile', message: 'Account not authorised for this hotel.' };
  }

  if (!access.is_active) {
    return { status: 'inactive', message: 'This staff account is inactive.' };
  }

  if (!['owner', 'front_desk'].includes(access.role)) {
    return { status: 'wrong_role', message: 'Account not authorised for this hotel.' };
  }

  if (access.hotel_slug !== authorisedHotelSlug || !access.hotel_id) {
    return { status: 'wrong_hotel', message: 'Account not authorised for this hotel.' };
  }

  return { status: 'authorized', access };
}
