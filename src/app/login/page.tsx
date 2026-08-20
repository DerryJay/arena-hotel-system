import { LoginForm } from '../../components/LoginForm';
import { getDashboardAccess } from '../../lib/auth/serverAccess';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const access = await getDashboardAccess();

  if (access.status === 'authorized') {
    redirect('/dashboard');
  }

  return <LoginForm />;
}
