import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffHotelAccessRecord } from './auth/access';
import { validatePaymentInput } from './reservations';
import {
  fulfillVerifiedPaystackPayment,
  initializePaystackPayment,
  nairaToKobo,
  validatePaystackAmount,
  validatePaystackEmail,
  validateVerifiedPaystackPayment,
  verifyPaystackTransaction,
  verifyPaystackWebhookSignature,
  type PaystackReservationContext,
  type PaystackVerificationData
} from './paystack';

const access: StaffHotelAccessRecord = {
  id: 'staff-1',
  hotel_id: 'hotel-1',
  hotel_name: '3dHotels',
  hotel_slug: '3dhotels',
  full_name: 'Owner',
  role: 'owner',
  is_active: true
};

const context: PaystackReservationContext = {
  id: 'res-1',
  hotelId: 'hotel-1',
  guestId: 'guest-1',
  bookingReference: '3DH-20260820-D44C',
  guestEmail: 'guest@example.com',
  balance: 75000
};

function mockJsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body
  } as Response;
}

function createIntentSupabase() {
  const rpc = vi.fn(() => ({
    single: vi.fn(async () => ({
      data: { ok: true, message: 'Paystack payment link generated.', payment_id: 'payment-1' },
      error: null
    }))
  }));

  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

type FakePayment = {
  id: string;
  hotel_id: string;
  reservation_id: string;
  amount: number;
  status: string;
  reference: string;
  provider: string;
  provider_expected_amount: number;
  provider_currency: string;
  reservations: { booking_reference: string; guest_id: string };
};

function createAdminSupabase(payment: FakePayment) {
  const update = vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: payment.id }, error: null }))
        }))
      }))
    }))
  }));

  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: payment, error: null }))
        }))
      }))
    })),
    update
  }));

  return { client: { from } as unknown as SupabaseClient, update };
}

const successfulTransaction: PaystackVerificationData = {
  status: 'success',
  reference: '3DH-ref',
  amount: 2500000,
  currency: 'NGN',
  metadata: {
    reservation_id: 'res-1',
    booking_reference: '3DH-20260820-D44C',
    hotel_id: 'hotel-1',
    guest_id: 'guest-1'
  }
};

const initializedPayment: FakePayment = {
  id: 'payment-1',
  hotel_id: 'hotel-1',
  reservation_id: 'res-1',
  amount: 25000,
  status: 'unpaid',
  reference: '3DH-ref',
  provider: 'paystack',
  provider_expected_amount: 25000,
  provider_currency: 'NGN',
  reservations: { booking_reference: '3DH-20260820-D44C', guest_id: 'guest-1' }
};

describe('Paystack payment integration', () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_secret';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  it('converts Naira to kobo', () => {
    expect(nairaToKobo(25000)).toBe(2500000);
    expect(nairaToKobo(10)).toBe(1000);
  });

  it('rejects amount above outstanding balance', () => {
    expect(validatePaystackAmount(75001, 75000)).toMatchObject({ ok: false });
  });

  it('handles missing email clearly', () => {
    expect(validatePaystackEmail('')).toEqual({ ok: false, message: 'Guest email is required for Paystack payment links.' });
  });

  it('initializes a valid Paystack transaction server-side', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/test',
        access_code: 'access-code',
        reference: '3DH-ref'
      }
    }));
    const { client, rpc } = createIntentSupabase();

    const result = await initializePaystackPayment(client, access, context, {
      reservationId: 'res-1',
      amount: 25000,
      email: 'guest@example.com',
      callbackUrl: 'http://localhost:3000/paystack/callback'
    });

    expect(result).toMatchObject({ ok: true, authorizationUrl: 'https://checkout.paystack.com/test', reference: '3DH-ref' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.paystack.co/transaction/initialize', expect.objectContaining({ method: 'POST' }));
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.amount).toBe('2500000');
    expect(body.metadata).toMatchObject({ reservation_id: 'res-1', hotel_id: 'hotel-1', booking_reference: '3DH-20260820-D44C' });
    expect(rpc).toHaveBeenCalledWith('create_paystack_payment_intent', expect.objectContaining({ p_amount: 25000, p_reference: '3DH-ref' }));
  });

  it('verifies a successful Paystack transaction', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({ status: true, message: 'Verification successful', data: successfulTransaction }));

    await expect(verifyPaystackTransaction('3DH-ref')).resolves.toMatchObject({ ok: true, data: { status: 'success' } });
  });

  it('rejects failed Paystack verification', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockJsonResponse({ status: true, message: 'Verification successful', data: { ...successfulTransaction, status: 'failed' } }));

    await expect(verifyPaystackTransaction('3DH-ref')).resolves.toMatchObject({ ok: false, message: 'Paystack transaction is failed.' });
  });

  it('rejects Paystack amount mismatches', () => {
    expect(validateVerifiedPaystackPayment(initializedPayment, { ...successfulTransaction, amount: 2600000 })).toMatchObject({ ok: false });
  });

  it('rejects invalid webhook signatures', () => {
    const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: '3DH-ref' } });
    const validSignature = createHmac('sha512', 'sk_test_secret').update(rawBody).digest('hex');

    expect(verifyPaystackWebhookSignature(rawBody, 'bad-signature', 'sk_test_secret')).toBe(false);
    expect(verifyPaystackWebhookSignature(rawBody, validSignature, 'sk_test_secret')).toBe(true);
  });

  it('requires a verified webhook signature before fulfillment', async () => {
    const { client, update } = createAdminSupabase(initializedPayment);

    await expect(fulfillVerifiedPaystackPayment(client, successfulTransaction, false)).resolves.toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('handles duplicate Paystack webhook/reference idempotently', async () => {
    const { client, update } = createAdminSupabase({ ...initializedPayment, status: 'paid' });

    await expect(fulfillVerifiedPaystackPayment(client, successfulTransaction, true)).resolves.toMatchObject({ ok: true, message: 'Paystack payment already recorded.' });
    expect(update).not.toHaveBeenCalled();
  });

  it('prevents cross-hotel Paystack assignment', () => {
    expect(validateVerifiedPaystackPayment(initializedPayment, { ...successfulTransaction, metadata: { ...successfulTransaction.metadata, hotel_id: 'hotel-2' } })).toMatchObject({ ok: false });
  });

  it('keeps existing manual payment validation working', () => {
    expect(validatePaymentInput({ reservationId: 'res-1', amount: 25000, method: 'cash', idempotencyKey: 'manual-1', outstandingBalance: 75000 })).toMatchObject({ ok: true, method: 'cash' });
  });
});
