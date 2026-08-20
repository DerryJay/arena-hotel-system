'use server';

import { redirect } from 'next/navigation';
import { getDashboardAccess } from './serverAccess';
import { createSupabaseServerClient } from '../supabase/server';
import { createBooking } from '../booking';

export async function createBookingAction(formData: FormData) {
  const access = await getDashboardAccess();

  if (access.status === 'unauthenticated') {
    redirect('/login');
  }

  if (access.status !== 'authorized') {
    redirect('/dashboard/new-booking?error=not_authorised');
  }

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect('/dashboard/new-booking?error=not_configured');
  }

  const result = await createBooking(supabase, access.access, {
    guestName: String(formData.get('guestName') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email: String(formData.get('email') ?? ''),
    checkIn: String(formData.get('checkIn') ?? ''),
    checkOut: String(formData.get('checkOut') ?? ''),
    adults: Number(formData.get('adults') ?? 0),
    children: Number(formData.get('children') ?? 0),
    roomTypeId: String(formData.get('roomTypeId') ?? '') || undefined,
    selectedRoomId: String(formData.get('selectedRoomId') ?? ''),
    nightlyRate: Number(formData.get('nightlyRate') ?? 0),
    source: String(formData.get('source') ?? 'front_desk'),
    notes: String(formData.get('notes') ?? '')
  });

  if (!result.ok) {
    const params = new URLSearchParams({
      error: result.message,
      checkIn: String(formData.get('checkIn') ?? ''),
      checkOut: String(formData.get('checkOut') ?? ''),
      roomTypeId: String(formData.get('roomTypeId') ?? '')
    });
    redirect(`/dashboard/new-booking?${params.toString()}`);
  }

  const params = new URLSearchParams({
    reference: result.confirmation.bookingReference,
    guest: result.confirmation.guestName,
    room: result.confirmation.roomNumber,
    checkIn: result.confirmation.checkIn,
    checkOut: result.confirmation.checkOut,
    nightlyRate: String(result.confirmation.nightlyRate),
    total: String(result.confirmation.totalStayValue)
  });

  redirect(`/dashboard/new-booking?${params.toString()}`);
}
