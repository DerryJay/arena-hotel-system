import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';
import { handleWhatsAppPayload, verifyWhatsAppSignature, verifyWhatsAppWebhookChallenge } from '../../../../lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const result = verifyWhatsAppWebhookChallenge(new URL(request.url).searchParams);

  if (!result.ok) {
    return new NextResponse(result.message, { status: result.status });
  }

  return new NextResponse(result.challenge, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256');

  if (!verifyWhatsAppSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, message: 'Invalid WhatsApp signature.' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid WhatsApp payload.' }, { status: 400 });
  }

  const adminSupabase = createSupabaseAdminClient();

  if (!adminSupabase) {
    return NextResponse.json({ ok: false, message: 'Server WhatsApp processing is not configured.' }, { status: 500 });
  }

  const result = await handleWhatsAppPayload(adminSupabase, payload);
  return NextResponse.json({ ok: true, ...result });
}
