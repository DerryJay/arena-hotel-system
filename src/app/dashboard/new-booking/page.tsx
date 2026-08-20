import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AccessDenied } from '../../../components/AccessDenied';
import { BookingForm } from '../../../components/BookingForm';
import { logoutAction } from '../../../lib/auth/actions';
import { createBookingAction } from '../../../lib/auth/bookingActions';
import { getDashboardAccess } from '../../../lib/auth/serverAccess';
import { getAvailableRoomsForDateRange } from '../../../lib/booking';
import { formatCurrency } from '../../../lib/dashboardMetrics';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

interface NewBookingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function NewBookingPage({ searchParams }: NewBookingPageProps) {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    return <AccessDenied reason={access.message} logoutAction={logoutAction} />;
  }

  const params = await searchParams;
  const checkIn = getParam(params, 'checkIn');
  const checkOut = getParam(params, 'checkOut');
  const roomTypeId = getParam(params, 'roomTypeId');
  const error = getParam(params, 'error');
  const reference = getParam(params, 'reference');
  const supabase = await createSupabaseServerClient();

  if (!supabase || !access.access.hotel_id) {
    return <AccessDenied reason="Unable to load booking tools for this hotel." logoutAction={logoutAction} />;
  }

  const roomTypesResponse = await supabase
    .from('room_types')
    .select('id, name, base_rate')
    .eq('hotel_id', access.access.hotel_id)
    .order('base_rate', { ascending: true });

  const roomTypes = (roomTypesResponse.data ?? []).map((roomType) => ({
    id: roomType.id as string,
    name: roomType.name as string,
    baseRate: Number(roomType.base_rate)
  }));

  const availableRooms = checkIn && checkOut && checkOut > checkIn
    ? await getAvailableRoomsForDateRange(supabase, access.access.hotel_id, checkIn, checkOut, roomTypeId || undefined)
    : [];

  const confirmation = reference
    ? {
        bookingReference: reference,
        guestName: getParam(params, 'guest'),
        roomNumber: getParam(params, 'room'),
        checkIn: getParam(params, 'checkIn'),
        checkOut: getParam(params, 'checkOut'),
        nightlyRate: Number(getParam(params, 'nightlyRate')),
        totalStayValue: Number(getParam(params, 'total'))
      }
    : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p>3dHotels</p>
          <h1>New Booking</h1>
        </div>
        <Link className="text-action" href="/dashboard">
          <ArrowLeft size={18} /> Dashboard
        </Link>
      </header>

      {confirmation ? (
        <section className="confirmation-panel">
          <CheckCircle2 size={24} />
          <div>
            <h2>{confirmation.bookingReference}</h2>
            <p>{confirmation.guestName} - Room {confirmation.roomNumber}</p>
            <p>{confirmation.checkIn} to {confirmation.checkOut}</p>
            <p>{formatCurrency(confirmation.nightlyRate)} nightly - {formatCurrency(confirmation.totalStayValue)} total</p>
          </div>
          <Link className="text-action" href="/dashboard">Return to dashboard</Link>
        </section>
      ) : null}

      <BookingForm
        action={createBookingAction}
        availableRooms={availableRooms}
        checkIn={checkIn}
        checkOut={checkOut}
        error={error}
        roomTypeId={roomTypeId}
        roomTypes={roomTypes}
      />
    </main>
  );
}

