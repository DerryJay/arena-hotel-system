import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffHotelAccessRecord } from './auth/access';

export interface PaystackReservationContext {
  id: string;
  hotelId: string;
  guestId: string;
  bookingReference: string;
  guestEmail: string;
  balance: number;
}

export interface InitializePaystackInput {
  reservationId: string;
  amount: number;
  email?: string;
  callbackUrl?: string;
}

export interface PaystackInitializeResult {
  ok: boolean;
  message: string;
  authorizationUrl?: string;
  reference?: string;
  paymentId?: string;
}

export interface PaystackVerificationData {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  metadata?: {
    reservation_id?: string;
    booking_reference?: string;
    hotel_id?: string;
    guest_id?: string;
  };
}

export interface PaystackVerificationResult {
  ok: boolean;
  message: string;
  data?: PaystackVerificationData;
}

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: PaystackVerificationData;
}

type ReservationLookupRow = {
  id: string;
  hotel_id: string;
  guest_id: string;
  booking_reference: string | null;
  guests: {
    email: string | null;
  } | null;
};

type PaystackPaymentRow = {
  id: string;
  hotel_id: string;
  reservation_id: string;
  amount: number | string;
  status: string;
  reference: string | null;
  provider: string | null;
  provider_expected_amount: number | string | null;
  provider_currency: string | null;
  reservations: {
    booking_reference: string | null;
    guest_id: string;
  } | null;
};

type CreatePaystackIntentRow = {
  ok: boolean;
  message: string;
  payment_id: string | null;
};

const paystackBaseUrl = 'https://api.paystack.co';
const currency = 'NGN';

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

export function nairaToKobo(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.round(amount * 100);
}

export function validatePaystackAmount(amount: number, balance: number): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, message: 'Payment amount must be greater than zero.' };
  }

  if (amount > balance) {
    return { ok: false, message: 'Payment amount cannot exceed the outstanding balance.' };
  }

  return { ok: true };
}

export function validatePaystackEmail(email: string): { ok: true; email: string } | { ok: false; message: string } {
  const normalized = email.trim();

  if (!normalized) {
    return { ok: false, message: 'Guest email is required for Paystack payment links.' };
  }

  if (!/^\S+@\S+\.\S+$/.test(normalized)) {
    return { ok: false, message: 'Enter a valid guest email for Paystack payment.' };
  }

  return { ok: true, email: normalized };
}

function getPaystackSecretKey(): string | null {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || null;
}

export function generatePaystackReference(bookingReference: string): string {
  const cleanBooking = bookingReference.replace(/[^A-Za-z0-9.-]/g, '').slice(0, 28) || 'reservation';
  return `3DH-${cleanBooking}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string | null, secretKey = getPaystackSecretKey()): boolean {
  if (!secretKey || !signature) {
    return false;
  }

  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');

  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function paystackFetch<T>(path: string, init: RequestInit, secretKey = getPaystackSecretKey()): Promise<T> {
  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  }

  const response = await fetch(`${paystackBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  const body = await response.json() as T;

  if (!response.ok) {
    const message = typeof (body as { message?: unknown }).message === 'string' ? (body as { message: string }).message : 'Paystack request failed.';
    throw new Error(message);
  }

  return body;
}

export async function verifyPaystackTransaction(reference: string): Promise<PaystackVerificationResult> {
  if (!reference.trim()) {
    return { ok: false, message: 'Paystack reference is required.' };
  }

  try {
    const response = await paystackFetch<PaystackVerifyResponse>(`/transaction/verify/${encodeURIComponent(reference.trim())}`, {
      method: 'GET'
    });

    if (!response.status || !response.data) {
      return { ok: false, message: response.message || 'Paystack verification failed.' };
    }

    if (response.data.status !== 'success') {
      return { ok: false, message: `Paystack transaction is ${response.data.status}.`, data: response.data };
    }

    return { ok: true, message: 'Paystack transaction verified.', data: response.data };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Paystack verification failed.' };
  }
}

export async function getPaystackReservationContext(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  reservationId: string,
  reservations: { id: string; balance: number; bookingReference: string; guestEmail: string }[]
): Promise<{ ok: true; context: PaystackReservationContext } | { ok: false; message: string }> {
  if (!access.hotel_id || !['owner', 'front_desk'].includes(access.role)) {
    return { ok: false, message: 'You are not authorised to generate Paystack payment links.' };
  }

  const reservation = reservations.find((item) => item.id === reservationId);

  if (!reservation) {
    return { ok: false, message: 'Reservation not found for this hotel.' };
  }

  const response = await supabase
    .from('reservations')
    .select('id, hotel_id, guest_id, booking_reference, guests(email)')
    .eq('id', reservationId)
    .eq('hotel_id', access.hotel_id)
    .single<ReservationLookupRow>();

  if (response.error || !response.data) {
    return { ok: false, message: response.error?.message ? `Unable to load reservation: ${response.error.message}` : 'Reservation not found for this hotel.' };
  }

  return {
    ok: true,
    context: {
      id: response.data.id,
      hotelId: response.data.hotel_id,
      guestId: response.data.guest_id,
      bookingReference: response.data.booking_reference ?? reservation.bookingReference,
      guestEmail: response.data.guests?.email ?? reservation.guestEmail,
      balance: reservation.balance
    }
  };
}

export async function initializePaystackPayment(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  context: PaystackReservationContext,
  input: InitializePaystackInput
): Promise<PaystackInitializeResult> {
  if (!access.hotel_id || context.hotelId !== access.hotel_id || !['owner', 'front_desk'].includes(access.role)) {
    return { ok: false, message: 'You are not authorised to generate Paystack payment links.' };
  }

  const amountValidation = validatePaystackAmount(input.amount, context.balance);
  if (!amountValidation.ok) return amountValidation;

  const emailValidation = validatePaystackEmail(input.email || context.guestEmail);
  if (!emailValidation.ok) return emailValidation;

  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    return { ok: false, message: 'PAYSTACK_SECRET_KEY is not configured.' };
  }

  const reference = generatePaystackReference(context.bookingReference);
  const amountKobo = nairaToKobo(input.amount);

  try {
    const response = await paystackFetch<PaystackInitializeResponse>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: emailValidation.email,
        amount: String(amountKobo),
        currency,
        reference,
        callback_url: input.callbackUrl,
        metadata: {
          reservation_id: context.id,
          booking_reference: context.bookingReference,
          hotel_id: context.hotelId,
          guest_id: context.guestId
        }
      })
    }, secretKey);

    if (!response.status || !response.data?.authorization_url || !response.data.access_code || !response.data.reference) {
      return { ok: false, message: response.message || 'Paystack did not return a payment link.' };
    }

    const intent = await supabase
      .rpc('create_paystack_payment_intent', {
        p_reservation_id: context.id,
        p_amount: input.amount,
        p_reference: response.data.reference,
        p_access_code: response.data.access_code,
        p_authorization_url: response.data.authorization_url,
        p_customer_email: emailValidation.email,
        p_currency: currency
      })
      .single<CreatePaystackIntentRow>();

    if (intent.error) {
      return { ok: false, message: `Unable to store Paystack payment link: ${intent.error.message}` };
    }

    if (!intent.data.ok) {
      return { ok: false, message: intent.data.message };
    }

    return {
      ok: true,
      message: intent.data.message,
      authorizationUrl: response.data.authorization_url,
      reference: response.data.reference,
      paymentId: intent.data.payment_id ?? undefined
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unable to initialize Paystack payment.' };
  }
}

export function validateVerifiedPaystackPayment(payment: PaystackPaymentRow, transaction: PaystackVerificationData): { ok: true; amountNaira: number } | { ok: false; message: string } {
  const amountNaira = transaction.amount / 100;

  if (transaction.status !== 'success') {
    return { ok: false, message: `Paystack transaction is ${transaction.status}.` };
  }

  if (transaction.currency !== 'NGN') {
    return { ok: false, message: 'Only successful NGN Paystack payments can be recorded.' };
  }

  if (transaction.reference !== payment.reference) {
    return { ok: false, message: 'Paystack reference does not match the initialized payment.' };
  }

  if (payment.provider !== 'paystack') {
    return { ok: false, message: 'Payment was not initialized with Paystack.' };
  }

  if (toNumber(payment.provider_expected_amount) !== amountNaira || toNumber(payment.amount) !== amountNaira) {
    return { ok: false, message: 'Paystack payment amount does not match the initialized payment.' };
  }

  if (payment.provider_currency !== transaction.currency) {
    return { ok: false, message: 'Paystack payment currency does not match the initialized payment.' };
  }

  if (payment.hotel_id !== transaction.metadata?.hotel_id || payment.reservation_id !== transaction.metadata?.reservation_id) {
    return { ok: false, message: 'Paystack payment metadata does not match the initialized reservation.' };
  }

  if (payment.reservations?.booking_reference !== transaction.metadata?.booking_reference || payment.reservations?.guest_id !== transaction.metadata?.guest_id) {
    return { ok: false, message: 'Paystack payment metadata does not match the initialized booking.' };
  }

  return { ok: true, amountNaira };
}

export async function fulfillVerifiedPaystackPayment(
  adminSupabase: SupabaseClient,
  transaction: PaystackVerificationData,
  signatureVerified: boolean
): Promise<{ ok: boolean; message: string; paymentId?: string }> {
  if (!signatureVerified) {
    return { ok: false, message: 'Paystack webhook signature must be verified before recording payment.' };
  }
  const paymentResponse = await adminSupabase
    .from('payments')
    .select('id, hotel_id, reservation_id, amount, status, reference, provider, provider_expected_amount, provider_currency, reservations(booking_reference, guest_id)')
    .eq('provider', 'paystack')
    .eq('reference', transaction.reference)
    .single<PaystackPaymentRow>();

  if (paymentResponse.error || !paymentResponse.data) {
    return { ok: false, message: paymentResponse.error?.message ? `Paystack payment lookup failed: ${paymentResponse.error.message}` : 'Paystack payment reference was not initialized.' };
  }

  const validation = validateVerifiedPaystackPayment(paymentResponse.data, transaction);
  if (!validation.ok) return validation;

  if (paymentResponse.data.status === 'paid') {
    return { ok: true, message: 'Paystack payment already recorded.', paymentId: paymentResponse.data.id };
  }

  if (paymentResponse.data.status !== 'unpaid') {
    return { ok: false, message: 'Paystack payment is not in a payable state.', paymentId: paymentResponse.data.id };
  }

  const updateResponse = await adminSupabase
    .from('payments')
    .update({
      status: 'paid',
      method: 'paystack_card',
      amount: validation.amountNaira,
      notes: 'Verified Paystack payment',
      provider_verified_at: new Date().toISOString()
    })
    .eq('id', paymentResponse.data.id)
    .eq('status', 'unpaid')
    .select('id')
    .single<{ id: string }>();

  if (updateResponse.error) {
    return { ok: false, message: `Unable to record Paystack payment: ${updateResponse.error.message}` };
  }

  return { ok: true, message: 'Paystack payment recorded.', paymentId: updateResponse.data.id };
}


export interface TrustedPaystackPaymentInput {
  hotelId: string;
  reservationId: string;
  guestId: string;
  bookingReference: string;
  guestEmail: string;
  amount: number;
  callbackUrl?: string;
  intentRpc?: 'create_whatsapp_paystack_intent';
}

export async function initializeTrustedPaystackPayment(
  adminSupabase: SupabaseClient,
  input: TrustedPaystackPaymentInput
): Promise<PaystackInitializeResult> {
  const amountValidation = validatePaystackAmount(input.amount, input.amount);
  if (!amountValidation.ok) return amountValidation;

  const emailValidation = validatePaystackEmail(input.guestEmail);
  if (!emailValidation.ok) return emailValidation;

  const secretKey = getPaystackSecretKey();
  if (!secretKey) {
    return { ok: false, message: 'PAYSTACK_SECRET_KEY is not configured.' };
  }

  const reference = generatePaystackReference(input.bookingReference);

  try {
    const response = await paystackFetch<PaystackInitializeResponse>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: emailValidation.email,
        amount: String(nairaToKobo(input.amount)),
        currency,
        reference,
        callback_url: input.callbackUrl,
        metadata: {
          reservation_id: input.reservationId,
          booking_reference: input.bookingReference,
          hotel_id: input.hotelId,
          guest_id: input.guestId
        }
      })
    }, secretKey);

    if (!response.status || !response.data?.authorization_url || !response.data.access_code || !response.data.reference) {
      return { ok: false, message: response.message || 'Paystack did not return a payment link.' };
    }

    const intent = await adminSupabase
      .rpc(input.intentRpc ?? 'create_whatsapp_paystack_intent', {
        p_hotel_id: input.hotelId,
        p_reservation_id: input.reservationId,
        p_amount: input.amount,
        p_reference: response.data.reference,
        p_access_code: response.data.access_code,
        p_authorization_url: response.data.authorization_url,
        p_customer_email: emailValidation.email,
        p_currency: currency
      })
      .single<CreatePaystackIntentRow>();

    if (intent.error) {
      return { ok: false, message: `Unable to store Paystack payment link: ${intent.error.message}` };
    }

    if (!intent.data.ok) {
      return { ok: false, message: intent.data.message };
    }

    return {
      ok: true,
      message: intent.data.message,
      authorizationUrl: response.data.authorization_url,
      reference: response.data.reference,
      paymentId: intent.data.payment_id ?? undefined
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Unable to initialize Paystack payment.' };
  }
}
