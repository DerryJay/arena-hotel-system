import { redirect } from 'next/navigation';
import { AccessDenied } from '../../components/AccessDenied';
import { Dashboard } from '../../components/Dashboard';
import { DashboardLoadError } from '../../components/DashboardLoadError';
import { logoutAction } from '../../lib/auth/actions';
import { getDashboardAccess } from '../../lib/auth/serverAccess';
import { getLiveDashboardData } from '../../lib/liveDashboard';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    return <AccessDenied reason={access.message} logoutAction={logoutAction} />;
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return <DashboardLoadError message="Supabase is not configured for this deployment." logoutAction={logoutAction} />;
  }

  try {
    const dashboardData = await getLiveDashboardData(supabase, access.access);
    return <Dashboard data={dashboardData} logoutAction={logoutAction} staffName={access.access.full_name} />;
  } catch {
    return <DashboardLoadError message="Unable to load hotel dashboard data." logoutAction={logoutAction} />;
  }
}
