import { evaluateDashboardAccess, type HotelRecord, type StaffProfileRecord } from './access';
import { createSupabaseServerClient } from '../supabase/server';

export async function getDashboardAccess() {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return evaluateDashboardAccess(null, null, null);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return evaluateDashboardAccess(null, null, null);
  }

  const { data: profile } = await supabase
    .from('staff_profiles')
    .select('id, hotel_id, full_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle<StaffProfileRecord>();

  if (!profile || !profile.is_active) {
    return evaluateDashboardAccess(user, profile, null);
  }

  const { data: hotel } = await supabase
    .from('hotels')
    .select('id, slug, name')
    .eq('id', profile.hotel_id)
    .maybeSingle<HotelRecord>();

  return evaluateDashboardAccess(user, profile, hotel);
}
