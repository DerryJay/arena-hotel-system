import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AccessDenied } from '../../../components/AccessDenied';
import { DashboardLoadError } from '../../../components/DashboardLoadError';
import { ReservationsManagement } from '../../../components/ReservationsManagement';
import { logoutAction } from '../../../lib/auth/actions';
import { checkInReservationAction } from '../../../lib/auth/checkInActions';
import { checkoutReservationAction } from '../../../lib/auth/checkoutActions';
import { recordReservationPaymentAction } from '../../../lib/auth/reservationActions';
import { getDashboardAccess } from '../../../lib/auth/serverAccess';
import { getReservationsManagementData } from '../../../lib/reservations';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

interface ReservationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function ReservationsPage({ searchParams }: ReservationsPageProps) {
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
  const search = getParam(params, 'search');
  const status = getParam(params, 'status');
  const reservationId = getParam(params, 'reservation');

  try {
    const reservationsData = await getReservationsManagementData(supabase, access.access, { search, status, reservationId });

    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p>3dHotels</p>
            <h1>Reservations</h1>
          </div>
          <Link className="text-action" href="/dashboard">
            <ArrowLeft size={18} /> Dashboard
          </Link>
        </header>

        <ReservationsManagement
          checkInAction={checkInReservationAction}
          checkInError={getParam(params, 'checkInError')}
          checkInSuccess={getParam(params, 'checkInSuccess')}
          checkoutAction={checkoutReservationAction}
          checkoutError={getParam(params, 'checkoutError')}
          checkoutSuccess={getParam(params, 'checkoutSuccess')}
          paymentAction={recordReservationPaymentAction}
          paymentError={getParam(params, 'paymentError')}
          paymentKey={randomUUID()}
          paymentSuccess={getParam(params, 'paymentSuccess')}
          reservations={reservationsData.reservations}
          search={search}
          selectedReservation={reservationsData.selectedReservation}
          status={status}
        />
      </main>
    );
  } catch {
    return <DashboardLoadError message="Unable to load reservations." logoutAction={logoutAction} />;
  }
}

