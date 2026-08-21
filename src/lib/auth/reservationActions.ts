'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordReservationPayment } from '../reservations';
import { createSupabaseServerClient } from '../supabase/server';
import { getDashboardAccess } from './serverAccess';

function getReservationRedirect(formData: FormData): string {
  const reservationId = String(formData.get('reservationId') ?? '');
  return reservationId ? `/dashboard/reservations?reservation=${encodeURIComponent(reservationId)}` : '/dashboard/reservations';
}

function redirectWithMessage(basePath: string, key: 'paymentError' | 'paymentSuccess', message: string): never {
  const separator = basePath.includes('?') ? '&' : '?';
  redirect(`${basePath}${separator}${key}=${encodeURIComponent(message)}`);
}

export async function recordReservationPaymentAction(formData: FormData) {
  const access = await getDashboardAccess();
  const basePath = getReservationRedirect(formData);

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirectWithMessage(basePath, 'paymentError', access.message);
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirectWithMessage(basePath, 'paymentError', 'Supabase is not configured for this deployment.');
  }

  const result = await recordReservationPayment(supabase, access.access, {
    reservationId: String(formData.get('reservationId') ?? ''),
    amount: Number(formData.get('amount') ?? 0),
    method: String(formData.get('method') ?? ''),
    reference: String(formData.get('reference') ?? ''),
    notes: String(formData.get('notes') ?? ''),
    idempotencyKey: String(formData.get('paymentKey') ?? ''),
    outstandingBalance: Number(formData.get('outstandingBalance') ?? Number.POSITIVE_INFINITY)
  });

  if (!result.ok) {
    redirectWithMessage(basePath, 'paymentError', result.message);
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/reservations');

  redirectWithMessage(basePath, 'paymentSuccess', result.message);
}
