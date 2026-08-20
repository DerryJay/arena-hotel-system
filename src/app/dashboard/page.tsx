import { redirect } from 'next/navigation';
import { AccessDenied } from '../../components/AccessDenied';
import { Dashboard } from '../../components/Dashboard';
import { DashboardLoadError } from '../../components/DashboardLoadError';
import { logoutAction } from '../../lib/auth/actions';
import { checkInReservationAction } from '../../lib/auth/checkInActions';
import { getDashboardAccess } from '../../lib/auth/serverAccess';
import { getLiveDashboardData } from '../../lib/liveDashboard';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
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

  const params = await searchParams;

  try {
    const dashboardData = await getLiveDashboardData(supabase, access.access);
    return (
      <Dashboard
        checkInAction={checkInReservationAction}
        checkInError={getParam(params, 'checkInError')}
        checkInResult={{
          message: getParam(params, 'checkInSuccess'),
          reference: getParam(params, 'reference'),
          guest: getParam(params, 'guest'),
          room: getParam(params, 'room'),
          early: getParam(params, 'early') === '1'
        }}
        data={dashboardData}
        logoutAction={logoutAction}
        staffName={access.access.full_name}
      />
    );
  } catch {
    return <DashboardLoadError message="Unable to load hotel dashboard data." logoutAction={logoutAction} />;
  }
}
