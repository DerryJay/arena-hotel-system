import { evaluateDashboardAccess, type StaffHotelAccessRecord } from './access';
import { createSupabaseServerClient } from '../supabase/server';

export async function getDashboardAccess() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return evaluateDashboardAccess(null, null);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return evaluateDashboardAccess(null, null);
  }

  const { data, error } = await supabase.rpc('get_current_staff_hotel_access');

  if (error) {
    return evaluateDashboardAccess(user, null, true);
  }

  const access = Array.isArray(data) ? (data[0] as StaffHotelAccessRecord | undefined) : undefined;

  return evaluateDashboardAccess(user, access ?? null);
}
