import type { User } from '@supabase/supabase-js';

export const authorisedHotelSlug = '3dhotels';

export interface StaffProfileRecord {
  id: string;
  hotel_id: string | null;
  full_name: string;
  role: string;
  is_active: boolean;
}

export interface HotelRecord {
  id: string;
  slug: string;
  name: string;
}

export type DashboardAccessResult =
  | { status: 'authorized'; profile: StaffProfileRecord; hotel: HotelRecord }
  | { status: 'unauthenticated'; message: string }
  | { status: 'no_profile'; message: string }
  | { status: 'inactive'; message: string }
  | { status: 'wrong_hotel'; message: string }
  | { status: 'wrong_role'; message: string }
  | { status: 'missing_hotel'; message: string };

export function evaluateDashboardAccess(
  user: Pick<User, 'id'> | null,
  profile: StaffProfileRecord | null,
  hotel: HotelRecord | null
): DashboardAccessResult {
  if (!user) {
    return { status: 'unauthenticated', message: 'Please sign in to continue.' };
  }

  if (!profile) {
    return { status: 'no_profile', message: 'Account not authorised for this hotel.' };
  }

  if (!profile.is_active) {
    return { status: 'inactive', message: 'This staff account is inactive.' };
  }

  if (profile.role !== 'owner') {
    return { status: 'wrong_role', message: 'Account not authorised for this hotel.' };
  }

  if (!hotel) {
    return { status: 'missing_hotel', message: 'Account not authorised for this hotel.' };
  }

  if (hotel.slug !== authorisedHotelSlug || profile.hotel_id !== hotel.id) {
    return { status: 'wrong_hotel', message: 'Account not authorised for this hotel.' };
  }

  return { status: 'authorized', profile, hotel };
}
