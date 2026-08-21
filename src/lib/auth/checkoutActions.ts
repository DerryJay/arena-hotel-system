'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { checkoutReservation } from '../checkout';
import { createSupabaseServerClient } from '../supabase/server';
import { getDashboardAccess } from './serverAccess';

function getCheckoutReturnPath(formData: FormData): string {
  const returnTo = String(formData.get('returnTo') ?? '');
  return returnTo.startsWith('/dashboard/reservations') ? returnTo : '/dashboard/reservations';
}

function redirectWithCheckoutMessage(formData: FormData, key: 'checkoutError' | 'checkoutSuccess', message: string, extra: Record<string, string> = {}): never {
  const returnPath = getCheckoutReturnPath(formData);
  const separator = returnPath.includes('?') ? '&' : '?';
  const params = new URLSearchParams({ [key]: message, ...extra });
  redirect(`${returnPath}${separator}${params.toString()}`);
}

export async function checkoutReservationAction(formData: FormData) {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirectWithCheckoutMessage(formData, 'checkoutError', access.message);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirectWithCheckoutMessage(formData, 'checkoutError', 'Supabase is not configured for this deployment.');
  }

  const result = await checkoutReservation(
    supabase,
    access.access,
    String(formData.get('reservationId') ?? ''),
    String(formData.get('confirmBalanceDue') ?? '') === 'yes'
  );

  if (!result.ok) {
    redirectWithCheckoutMessage(formData, 'checkoutError', result.message, {
      balance: String(result.outstandingBalance)
    });
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/reservations');
  revalidatePath('/dashboard/new-booking');

  redirectWithCheckoutMessage(formData, 'checkoutSuccess', result.message, {
    reference: result.bookingReference ?? '',
    guest: result.guestName ?? '',
    room: result.roomNumber ?? '',
    balance: String(result.outstandingBalance)
  });
}
