'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkInReservation } from '../checkIn';
import { createSupabaseServerClient } from '../supabase/server';
import { getDashboardAccess } from './serverAccess';

function getCheckInReturnPath(formData: FormData): string {
  const returnTo = String(formData.get('returnTo') ?? '');
  return returnTo.startsWith('/dashboard/reservations') ? returnTo : '/dashboard';
}

function redirectWithCheckInError(formData: FormData, message: string): never {
  const returnPath = getCheckInReturnPath(formData);
  const separator = returnPath.includes('?') ? '&' : '?';
  redirect(`${returnPath}${separator}checkInError=${encodeURIComponent(message)}`);
}

export async function checkInReservationAction(formData: FormData) {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirectWithCheckInError(formData, 'not_authorised');
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirectWithCheckInError(formData, 'not_configured');
  }

  const result = await checkInReservation(supabase, access.access, String(formData.get('reservationId') ?? ''));

  if (!result.ok) {
    redirectWithCheckInError(formData, result.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/reservations');

  const params = new URLSearchParams({
    checkInSuccess: result.message,
    reference: result.bookingReference ?? '',
    guest: result.guestName ?? '',
    room: result.roomNumber ?? '',
    early: result.earlyCheckIn ? '1' : '0'
  });
  const returnPath = getCheckInReturnPath(formData);
  const separator = returnPath.includes('?') ? '&' : '?';

  redirect(`${returnPath}${separator}${params.toString()}`);
}
