'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { manageRoom } from '../rooms';
import type { RoomStatus } from '../types';
import { createSupabaseServerClient } from '../supabase/server';
import { getDashboardAccess } from './serverAccess';

function redirectWithError(message: string): never {
  const params = new URLSearchParams({ error: message });
  redirect(`/dashboard/rooms?${params.toString()}`);
}

export async function manageRoomAction(formData: FormData) {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirectWithError(access.message);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirectWithError('Supabase is not configured for this deployment.');
  }

  const result = await manageRoom(supabase, access.access, {
    roomId: String(formData.get('roomId') ?? '') || undefined,
    roomNumber: String(formData.get('roomNumber') ?? ''),
    roomTypeId: String(formData.get('roomTypeId') ?? ''),
    floor: String(formData.get('floor') ?? ''),
    status: String(formData.get('status') ?? 'available') as RoomStatus,
    notes: String(formData.get('notes') ?? ''),
    baseRate: Number(formData.get('baseRate') ?? 0),
    capacity: Number(formData.get('capacity') ?? 0),
    description: String(formData.get('description') ?? '')
  });

  if (!result.ok) {
    redirectWithError(result.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/rooms');
  revalidatePath('/dashboard/new-booking');

  const params = new URLSearchParams({ success: result.message });
  redirect(`/dashboard/rooms?${params.toString()}`);
}

