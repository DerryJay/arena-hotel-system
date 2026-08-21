import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { filterAvailableRooms, getStayNights, type BookingRoomOption, type ExistingInventoryReservation } from './booking';
import { formatCurrency } from './dashboardMetrics';
import { initializeTrustedPaystackPayment } from './paystack';
import type { RoomStatus } from './types';

export type WhatsAppStep =
  | 'start'
  | 'awaiting_check_in'
  | 'awaiting_check_out'
  | 'awaiting_room_selection'
  | 'awaiting_guest_name'
  | 'awaiting_guest_email'
  | 'awaiting_confirmation'
  | 'payment_link_sent'
  | 'completed';

export interface WhatsAppSession {
  id: string;
  hotel_id: string;
  wa_id: string;
  phone_number: string | null;
  step: WhatsAppStep;
  check_in: string | null;
  check_out: string | null;
  selected_room_id: string | null;
  selected_room_type_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  reservation_id: string | null;
  available_rooms: BookingRoomOption[];
  payment_confirmation_sent_at?: string | null;
}

interface HotelRow {
  id: string;
  name: string;
  slug: string;
}

interface RoomRow {
  id: string;
  room_number: string;
  status: RoomStatus;
  room_type_id: string;
  room_types: { name: string; base_rate: number | string } | null;
}

interface ReservationCreatedRow {
  ok: boolean;
  message: string;
  reservation_id: string | null;
  guest_id: string | null;
  booking_reference: string | null;
  room_number: string | null;
  nightly_rate: number | string;
  total_amount: number | string;
}

interface WhatsAppMessage {
  id: string;
  waId: string;
  from: string;
  text: string;
}

const graphVersion = 'v21.0';
const bookingStarters = new Set(['hi', 'hello', 'book', 'booking']);

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function getWhatsAppConfig() {
  return {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? process.env.META_WHATSAPP_VERIFY_TOKEN ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? process.env.META_WHATSAPP_ACCESS_TOKEN ?? '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    hotelSlug: process.env.WHATSAPP_HOTEL_SLUG ?? '3dhotels',
    appUrl: process.env.APP_URL ?? ''
  };
}

export function verifyWhatsAppWebhookChallenge(searchParams: URLSearchParams): { ok: true; challenge: string } | { ok: false; status: number; message: string } {
  const config = getWhatsAppConfig();
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge') ?? '';

  if (mode === 'subscribe' && token && token === config.verifyToken) {
    return { ok: true, challenge };
  }

  return { ok: false, status: 403, message: 'WhatsApp webhook verification failed.' };
}

export function verifyWhatsAppSignature(rawBody: string, signature: string | null, appSecret = getWhatsAppConfig().appSecret): boolean {
  if (!appSecret || !signature?.startsWith('sha256=')) {
    return false;
  }

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const actual = signature.slice('sha256='.length);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');

  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function parseIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;

  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10) === trimmed ? trimmed : null;
}

export function extractWhatsAppMessages(payload: unknown): WhatsAppMessage[] {
  const messages: WhatsAppMessage[] = [];
  const entries = (payload as { entry?: unknown[] }).entry ?? [];

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] }).changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[]; contacts?: { wa_id?: string }[] } }).value;
      for (const message of value?.messages ?? []) {
        const typed = message as { id?: string; from?: string; type?: string; text?: { body?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } };
        const text = typed.text?.body ?? typed.interactive?.button_reply?.title ?? typed.interactive?.list_reply?.title ?? '';
        if (typed.id && typed.from && text) {
          messages.push({ id: typed.id, from: typed.from, waId: value?.contacts?.[0]?.wa_id ?? typed.from, text: text.trim() });
        }
      }
    }
  }

  return messages;
}

export async function sendWhatsAppText(to: string, text: string): Promise<{ ok: boolean; message: string }> {
  const config = getWhatsAppConfig();

  if (!config.accessToken || !config.phoneNumberId) {
    return { ok: false, message: 'WhatsApp Cloud API is not configured.' };
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${config.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text }
    })
  });

  if (!response.ok) {
    return { ok: false, message: 'Unable to send WhatsApp message.' };
  }

  return { ok: true, message: 'WhatsApp message sent.' };
}

async function getHotel(adminSupabase: SupabaseClient, slug: string): Promise<HotelRow | null> {
  const response = await adminSupabase.from('hotels').select('id, name, slug').eq('slug', slug).single<HotelRow>();
  return response.data ?? null;
}

async function isDuplicateMessage(adminSupabase: SupabaseClient, hotelId: string, message: WhatsAppMessage): Promise<boolean> {
  const response = await adminSupabase
    .from('whatsapp_processed_messages')
    .insert({ hotel_id: hotelId, message_id: message.id, wa_id: message.waId })
    .select('id')
    .single<{ id: string }>();

  return Boolean(response.error);
}

async function getOrCreateSession(adminSupabase: SupabaseClient, hotelId: string, message: WhatsAppMessage): Promise<WhatsAppSession> {
  const existing = await adminSupabase
    .from('whatsapp_sessions')
    .select('id, hotel_id, wa_id, phone_number, step, check_in, check_out, selected_room_id, selected_room_type_id, guest_name, guest_email, reservation_id, available_rooms, payment_confirmation_sent_at')
    .eq('hotel_id', hotelId)
    .eq('wa_id', message.waId)
    .maybeSingle<WhatsAppSession>();

  if (existing.data) {
    return existing.data;
  }

  const created = await adminSupabase
    .from('whatsapp_sessions')
    .insert({ hotel_id: hotelId, wa_id: message.waId, phone_number: message.from, step: 'start' })
    .select('id, hotel_id, wa_id, phone_number, step, check_in, check_out, selected_room_id, selected_room_type_id, guest_name, guest_email, reservation_id, available_rooms, payment_confirmation_sent_at')
    .single<WhatsAppSession>();

  if (created.error || !created.data) throw new Error(created.error?.message ?? 'Unable to create WhatsApp session.');
  return created.data;
}

async function updateSession(adminSupabase: SupabaseClient, sessionId: string, values: Partial<WhatsAppSession>) {
  await adminSupabase.from('whatsapp_sessions').update(values).eq('id', sessionId);
}

export async function getAvailableWhatsAppRooms(adminSupabase: SupabaseClient, hotelId: string, checkIn: string, checkOut: string): Promise<BookingRoomOption[]> {
  const [roomsResponse, reservationsResponse] = await Promise.all([
    adminSupabase
      .from('rooms')
      .select('id, room_number, status, room_type_id, room_types(name, base_rate)')
      .eq('hotel_id', hotelId)
      .order('room_number', { ascending: true }),
    adminSupabase
      .from('reservations')
      .select('room_id, check_in, check_out, status')
      .eq('hotel_id', hotelId)
      .in('status', ['reserved', 'confirmed', 'checked_in'])
      .lt('check_in', checkOut)
      .gt('check_out', checkIn)
  ]);

  if (roomsResponse.error) throw new Error(`Unable to load rooms: ${roomsResponse.error.message}`);
  if (reservationsResponse.error) throw new Error(`Unable to load reservations: ${reservationsResponse.error.message}`);

  const rooms = ((roomsResponse.data ?? []) as unknown as RoomRow[]).map((room) => ({
    id: room.id,
    roomNumber: room.room_number,
    roomTypeId: room.room_type_id,
    roomTypeName: room.room_types?.name ?? 'Unassigned',
    baseRate: toNumber(room.room_types?.base_rate),
    status: room.status
  }));

  return filterAvailableRooms(rooms, (reservationsResponse.data ?? []) as ExistingInventoryReservation[], checkIn, checkOut);
}

function formatRoomList(rooms: BookingRoomOption[]): string {
  return rooms.slice(0, 9).map((room, index) => `${index + 1}. Room ${room.roomNumber} - ${room.roomTypeName} - ${formatCurrency(room.baseRate)}/night`).join('\n');
}

function isStarter(text: string): boolean {
  return bookingStarters.has(text.trim().toLowerCase());
}

function isConfirm(text: string): boolean {
  return text.trim().toUpperCase() === 'CONFIRM';
}

function looksLikeEmail(text: string): boolean {
  return /^\S+@\S+\.\S+$/.test(text.trim());
}

export async function processWhatsAppMessage(adminSupabase: SupabaseClient, message: WhatsAppMessage): Promise<string | null> {
  const config = getWhatsAppConfig();
  const hotel = await getHotel(adminSupabase, config.hotelSlug);
  if (!hotel) return '3dHotels booking is not configured yet.';

  if (await isDuplicateMessage(adminSupabase, hotel.id, message)) {
    return null;
  }

  const session = await getOrCreateSession(adminSupabase, hotel.id, message);
  const text = message.text.trim();

  if (isStarter(text)) {
    await updateSession(adminSupabase, session.id, { step: 'awaiting_check_in', check_in: null, check_out: null, selected_room_id: null, guest_name: null, guest_email: null, reservation_id: null, available_rooms: [] });
    return 'Welcome to 3dHotels. I can help you book a room. Please send your check-in date as YYYY-MM-DD.';
  }

  if (session.step === 'start' || session.step === 'completed') {
    return 'Send Hi, Hello, Book, or Booking to start a room booking.';
  }

  if (session.step === 'awaiting_check_in') {
    const checkIn = parseIsoDate(text);
    if (!checkIn) return 'Please send a valid check-in date as YYYY-MM-DD.';
    await updateSession(adminSupabase, session.id, { step: 'awaiting_check_out', check_in: checkIn });
    return 'Great. Please send your check-out date as YYYY-MM-DD.';
  }

  if (session.step === 'awaiting_check_out') {
    const checkOut = parseIsoDate(text);
    if (!checkOut) return 'Please send a valid check-out date as YYYY-MM-DD.';
    if (!session.check_in || checkOut <= session.check_in) return 'Check-out must be after check-in. Please send a later check-out date as YYYY-MM-DD.';

    const rooms = await getAvailableWhatsAppRooms(adminSupabase, hotel.id, session.check_in, checkOut);
    if (rooms.length === 0) return 'No rooms are available for those dates. Send Book to try different dates.';

    await updateSession(adminSupabase, session.id, { step: 'awaiting_room_selection', check_out: checkOut, available_rooms: rooms });
    return `Available rooms:\n${formatRoomList(rooms)}\nReply with the room number option, for example 1.`;
  }

  if (session.step === 'awaiting_room_selection') {
    const choice = Number.parseInt(text, 10);
    const rooms = session.available_rooms ?? [];
    const room = Number.isInteger(choice) ? rooms[choice - 1] : undefined;
    if (!room) return 'Please choose a valid room option number from the list.';
    await updateSession(adminSupabase, session.id, { step: 'awaiting_guest_name', selected_room_id: room.id, selected_room_type_id: room.roomTypeId });
    return 'What name should we put on the booking?';
  }

  if (session.step === 'awaiting_guest_name') {
    if (text.length < 2) return 'Please send the guest full name.';
    await updateSession(adminSupabase, session.id, { step: 'awaiting_guest_email', guest_name: text.slice(0, 120) });
    return 'Please send the guest email address for the Paystack payment link.';
  }

  if (session.step === 'awaiting_guest_email') {
    if (!looksLikeEmail(text)) return 'Please send a valid email address for Paystack payment.';
    const rooms = session.available_rooms ?? [];
    const room = rooms.find((candidate) => candidate.id === session.selected_room_id);
    if (!room || !session.check_in || !session.check_out || !session.guest_name) return 'This booking session is incomplete. Send Book to start again.';
    const nights = getStayNights(session.check_in, session.check_out);
    await updateSession(adminSupabase, session.id, { step: 'awaiting_confirmation', guest_email: text });
    return `Please confirm your booking:\nHotel: ${hotel.name}\nRoom: ${room.roomNumber} - ${room.roomTypeName}\nCheck-in: ${session.check_in}\nCheck-out: ${session.check_out}\nNights: ${nights}\nRate: ${formatCurrency(room.baseRate)}/night\nTotal: ${formatCurrency(room.baseRate * nights)}\nGuest: ${session.guest_name}\nReply CONFIRM to create the reservation.`;
  }

  if (session.step === 'awaiting_confirmation') {
    if (!isConfirm(text)) return 'Reply CONFIRM to create the reservation, or send Book to start again.';
    if (session.reservation_id) return 'This reservation has already been created. Please use the payment link already sent.';
    if (!session.check_in || !session.check_out || !session.selected_room_id || !session.guest_name || !session.guest_email) return 'This booking session is incomplete. Send Book to start again.';

    const stillAvailable = await getAvailableWhatsAppRooms(adminSupabase, hotel.id, session.check_in, session.check_out);
    const selected = stillAvailable.find((room) => room.id === session.selected_room_id);
    if (!selected) return 'That room is no longer available. Send Book to choose different dates.';

    const reservationResponse = await adminSupabase.rpc('create_whatsapp_reservation', {
      p_hotel_slug: hotel.slug,
      p_wa_id: message.waId,
      p_room_id: session.selected_room_id,
      p_guest_name: session.guest_name,
      p_guest_email: session.guest_email,
      p_phone: message.from,
      p_check_in: session.check_in,
      p_check_out: session.check_out
    }).single<ReservationCreatedRow>();

    if (reservationResponse.error || !reservationResponse.data?.ok) {
      return reservationResponse.data?.message ?? `Unable to create reservation: ${reservationResponse.error?.message ?? 'unknown error'}`;
    }

    const created = reservationResponse.data;
    const paystack = await initializeTrustedPaystackPayment(adminSupabase, {
      hotelId: hotel.id,
      reservationId: created.reservation_id ?? '',
      guestId: created.guest_id ?? '',
      bookingReference: created.booking_reference ?? 'Pending reference',
      guestEmail: session.guest_email,
      amount: toNumber(created.total_amount),
      callbackUrl: config.appUrl ? `${config.appUrl}/paystack/callback` : undefined,
      intentRpc: 'create_whatsapp_paystack_intent'
    });

    if (!paystack.ok || !paystack.authorizationUrl) {
      return `Your booking was created, but the payment link could not be generated. Booking reference: ${created.booking_reference}.`;
    }

    await updateSession(adminSupabase, session.id, { step: 'payment_link_sent', reservation_id: created.reservation_id });
    return `Your booking is reserved. Booking reference: ${created.booking_reference}. Complete payment here: ${paystack.authorizationUrl}`;
  }

  if (session.step === 'payment_link_sent') {
    return 'Your booking has been created and the payment link has been sent. Send Book to start a new booking.';
  }

  return 'Sorry, I did not understand that. Send Book to start a room booking.';
}

export async function handleWhatsAppPayload(adminSupabase: SupabaseClient, payload: unknown): Promise<{ processed: number; sent: number }> {
  const messages = extractWhatsAppMessages(payload);
  let sent = 0;

  for (const message of messages) {
    const reply = await processWhatsAppMessage(adminSupabase, message);
    if (reply) {
      const result = await sendWhatsAppText(message.waId, reply);
      if (result.ok) sent += 1;
    }
  }

  return { processed: messages.length, sent };
}

export async function maybeSendWhatsAppPaymentConfirmation(adminSupabase: SupabaseClient, paymentId?: string): Promise<void> {
  if (!paymentId) return;

  const payment = await adminSupabase
    .from('payments')
    .select('id, reservation_id, reservations(booking_reference, source)')
    .eq('id', paymentId)
    .single<{ id: string; reservation_id: string; reservations: { booking_reference: string | null; source: string | null } | null }>();

  if (payment.error || payment.data?.reservations?.source !== 'whatsapp') return;

  const session = await adminSupabase
    .from('whatsapp_sessions')
    .select('id, wa_id, payment_confirmation_sent_at')
    .eq('reservation_id', payment.data.reservation_id)
    .is('payment_confirmation_sent_at', null)
    .maybeSingle<{ id: string; wa_id: string; payment_confirmation_sent_at: string | null }>();

  if (session.error || !session.data) return;

  const reference = payment.data.reservations.booking_reference ?? 'your booking';
  const sent = await sendWhatsAppText(session.data.wa_id, `Payment received. Your booking ${reference} is confirmed.`);

  if (sent.ok) {
    await adminSupabase
      .from('whatsapp_sessions')
      .update({ payment_confirmation_sent_at: new Date().toISOString(), step: 'completed' })
      .eq('id', session.data.id)
      .is('payment_confirmation_sent_at', null);
  }
}
