'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getReservationsManagementData } from '../reservations';
import { getPaystackReservationContext, initializePaystackPayment } from '../paystack';
import { createSupabaseServerClient } from '../supabase/server';
import { getDashboardAccess } from './serverAccess';

function getReservationRedirect(formData: FormData): string {
  const reservationId = String(formData.get('reservationId') ?? '');
  return reservationId ? `/dashboard/reservations?reservation=${encodeURIComponent(reservationId)}` : '/dashboard/reservations';
}

function redirectWithMessage(basePath: string, values: Record<string, string>): never {
  const params = new URLSearchParams(values);
  const separator = basePath.includes('?') ? '&' : '?';
  redirect(`${basePath}${separator}${params.toString()}`);
}

async function getCallbackUrl(): Promise<string | undefined> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get('origin') || process.env.APP_URL || '';
  return origin ? `${origin}/paystack/callback` : undefined;
}

export async function initializePaystackPaymentAction(formData: FormData) {
  const access = await getDashboardAccess();
  const basePath = getReservationRedirect(formData);

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirectWithMessage(basePath, { paystackError: access.message });
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirectWithMessage(basePath, { paystackError: 'Supabase is not configured for this deployment.' });
  }

  const reservationId = String(formData.get('reservationId') ?? '');
  const amount = Number(formData.get('paystackAmount') ?? 0);
  const email = String(formData.get('paystackEmail') ?? '');

  const reservationsData = await getReservationsManagementData(supabase, access.access, { reservationId });
  const reservationItems = reservationsData.selectedReservation ? [reservationsData.selectedReservation] : reservationsData.reservations;
  const context = await getPaystackReservationContext(supabase, access.access, reservationId, reservationItems);

  if (!context.ok) {
    redirectWithMessage(basePath, { paystackError: context.message });
  }

  const result = await initializePaystackPayment(supabase, access.access, context.context, {
    reservationId,
    amount,
    email,
    callbackUrl: await getCallbackUrl()
  });

  if (!result.ok || !result.authorizationUrl || !result.reference) {
    redirectWithMessage(basePath, { paystackError: result.message });
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/reservations');

  redirectWithMessage(basePath, {
    paystackSuccess: 'Paystack payment link generated.',
    paystackUrl: result.authorizationUrl,
    paystackReference: result.reference
  });
}
