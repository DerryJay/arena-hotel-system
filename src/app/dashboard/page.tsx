import { redirect } from 'next/navigation';
import { AccessDenied } from '../../components/AccessDenied';
import { Dashboard } from '../../components/Dashboard';
import { logoutAction } from '../../lib/auth/actions';
import { getDashboardAccess } from '../../lib/auth/serverAccess';
import { demoDashboardData } from '../../lib/mockData';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    return <AccessDenied reason={access.message} logoutAction={logoutAction} />;
  }

  return <Dashboard data={demoDashboardData} isDemo={false} logoutAction={logoutAction} staffName={access.access.full_name} />;
}
