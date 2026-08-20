'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkInReservation } from '../checkIn';
import { createSupabaseServerClient } from '../supabase/server';
import { getDashboardAccess } from './serverAccess';

export async function checkInReservationAction(formData: FormData) {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirect('/dashboard?checkInError=not_authorised');
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect('/dashboard?checkInError=not_configured');
  }

  const result = await checkInReservation(supabase, access.access, String(formData.get('reservationId') ?? ''));

  if (!result.ok) {
    const params = new URLSearchParams({ checkInError: result.message });
    redirect(`/dashboard?${params.toString()}`);
  }

  revalidatePath('/dashboard');

  const params = new URLSearchParams({
    checkInSuccess: result.message,
    reference: result.bookingReference ?? '',
    guest: result.guestName ?? '',
    room: result.roomNumber ?? '',
    early: result.earlyCheckIn ? '1' : '0'
  });

  redirect(`/dashboard?${params.toString()}`);
}
