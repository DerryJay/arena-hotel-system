import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AccessDenied } from '../../../components/AccessDenied';
import { DashboardLoadError } from '../../../components/DashboardLoadError';
import { RoomManagement } from '../../../components/RoomManagement';
import { logoutAction } from '../../../lib/auth/actions';
import { manageRoomAction } from '../../../lib/auth/roomActions';
import { getDashboardAccess } from '../../../lib/auth/serverAccess';
import { getRoomManagementData } from '../../../lib/rooms';
import { createSupabaseServerClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

interface RoomsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function RoomsPage({ searchParams }: RoomsPageProps) {
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
  const editRoomId = getParam(params, 'edit');

  try {
    const roomData = await getRoomManagementData(supabase, access.access, { search, status });

    return (
      <main className="app-shell">
        <header className="topbar">
          <div>
            <p>3dHotels</p>
            <h1>Rooms</h1>
          </div>
          <Link className="text-action" href="/dashboard">
            <ArrowLeft size={18} /> Dashboard
          </Link>
        </header>

        <RoomManagement
          action={manageRoomAction}
          editRoomId={editRoomId}
          error={getParam(params, 'error')}
          rooms={roomData.rooms}
          roomTypes={roomData.roomTypes}
          search={search}
          status={status}
          success={getParam(params, 'success')}
        />
      </main>
    );
  } catch {
    return <DashboardLoadError message="Unable to load room management." logoutAction={logoutAction} />;
  }
}
