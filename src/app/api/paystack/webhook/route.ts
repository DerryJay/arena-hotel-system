import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';
import { fulfillVerifiedPaystackPayment, verifyPaystackTransaction, verifyPaystackWebhookSignature } from '../../../../lib/paystack';

export const dynamic = 'force-dynamic';

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    reference?: string;
  };
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-paystack-signature');

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, message: 'Invalid Paystack signature.' }, { status: 401 });
  }

  let payload: PaystackWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as PaystackWebhookPayload;
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid webhook payload.' }, { status: 400 });
  }

  if (payload.event !== 'charge.success' || !payload.data?.reference) {
    return NextResponse.json({ ok: true, message: 'Webhook ignored.' });
  }

  const verification = await verifyPaystackTransaction(payload.data.reference);

  if (!verification.ok || !verification.data) {
    return NextResponse.json({ ok: false, message: verification.message }, { status: 400 });
  }

  const adminSupabase = createSupabaseAdminClient();

  if (!adminSupabase) {
    return NextResponse.json({ ok: false, message: 'Server payment verification is not configured.' }, { status: 500 });
  }

  const result = await fulfillVerifiedPaystackPayment(adminSupabase, verification.data, true);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
