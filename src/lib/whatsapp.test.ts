import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAvailableWhatsAppRooms,
  parseIsoDate,
  processWhatsAppMessage,
  verifyWhatsAppSignature,
  verifyWhatsAppWebhookChallenge,
  type WhatsAppSession
} from './whatsapp';

const hotel = { id: 'hotel-1', name: '3dHotels', slug: '3dhotels' };
const room101 = { id: 'room-101', room_number: '101', status: 'available', room_type_id: 'standard', hotel_id: 'hotel-1', room_types: { name: 'Standard', base_rate: 25000 } };
const room102 = { id: 'room-102', room_number: '102', status: 'available', room_type_id: 'standard', hotel_id: 'hotel-1', room_types: { name: 'Standard', base_rate: 25000 } };
const otherHotelRoom = { id: 'room-201', room_number: '201', status: 'available', room_type_id: 'standard', hotel_id: 'hotel-2', room_types: { name: 'Standard', base_rate: 25000 } };

type Store = {
  hotels: typeof hotel[];
  rooms: typeof room101[];
  reservations: Array<{ id: string; hotel_id: string; room_id: string; status: string; check_in: string; check_out: string; nightly_rate?: number; source?: string; guest_id?: string; booking_reference?: string }>;
  whatsapp_sessions: WhatsAppSession[];
  whatsapp_processed_messages: Array<{ id: string; hotel_id: string; message_id: string; wa_id: string }>;
  guests: Array<{ id: string; hotel_id: string; phone: string; full_name: string; email: string }>;
  payments: unknown[];
};

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    hotels: [hotel],
    rooms: [room101, room102, otherHotelRoom],
    reservations: [],
    whatsapp_sessions: [],
    whatsapp_processed_messages: [],
    guests: [],
    payments: [],
    ...overrides
  };
}

class QueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private operation: 'select' | 'insert' | 'update' = 'select';
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;

  constructor(private store: Store, private table: keyof Store) {}

  select() { if (this.operation !== 'insert' && this.operation !== 'update') this.operation = 'select'; return this; }
  order() { return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  lt(column: string, value: unknown) { this.filters.push((row) => String(row[column]) < String(value)); return this; }
  gt(column: string, value: unknown) { this.filters.push((row) => String(row[column]) > String(value)); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]) { this.operation = 'insert'; this.payload = payload; return this; }
  update(payload: Record<string, unknown>) { this.operation = 'update'; this.payload = payload; return this; }

  private rows(): Record<string, unknown>[] {
    return (this.store[this.table] as unknown as Record<string, unknown>[]).filter((row) => this.filters.every((filter) => filter(row)));
  }

  private decorate(row: Record<string, unknown>): Record<string, unknown> {
    if (this.table === 'rooms') return { ...row };
    if (this.table === 'whatsapp_sessions') return { ...row };
    return { ...row };
  }

  async single<T>() {
    if (this.operation === 'insert') {
      const payload = Array.isArray(this.payload) ? this.payload[0] : this.payload;
      if (!payload) return { data: null, error: { message: 'missing payload' } };
      if (this.table === 'whatsapp_processed_messages' && this.store.whatsapp_processed_messages.some((row) => row.message_id === payload.message_id && row.hotel_id === payload.hotel_id)) {
        return { data: null, error: { message: 'duplicate key value' } };
      }
      const row = { id: `${String(this.table)}-${Date.now()}-${Math.random()}`, ...payload } as Record<string, unknown>;
      (this.store[this.table] as unknown as Record<string, unknown>[]).push(row);
      return { data: this.decorate(row) as T, error: null };
    }

    if (this.operation === 'update') {
      const rows = this.rows();
      for (const row of rows) Object.assign(row, this.payload);
      return { data: (rows[0] ? this.decorate(rows[0]) : null) as T, error: rows[0] ? null : { message: 'not found' } };
    }

    const row = this.rows()[0];
    return { data: (row ? this.decorate(row) : null) as T, error: row ? null : { message: 'not found' } };
  }

  async maybeSingle<T>() {
    const row = this.rows()[0];
    return { data: (row ? this.decorate(row) : null) as T | null, error: null };
  }

  then(resolve: (value: { data: unknown[]; error: null }) => void) {
    if (this.operation === 'update') {
      const rows = this.rows();
      for (const row of rows) Object.assign(row, this.payload);
      resolve({ data: rows.map((row) => this.decorate(row)), error: null });
      return;
    }

    resolve({ data: this.rows().map((row) => this.decorate(row)), error: null });
  }
}

function createSupabase(overrides: Partial<Store> = {}) {
  const store = createStore(overrides);
  const rpc = vi.fn((name: string, params: Record<string, unknown>) => ({
    single: async () => {
      if (name === 'create_whatsapp_reservation') {
        const room = store.rooms.find((candidate) => candidate.id === params.p_room_id && candidate.hotel_id === hotel.id);
        const conflict = store.reservations.some((reservation) => reservation.room_id === params.p_room_id && reservation.status === 'confirmed' && reservation.check_in < String(params.p_check_out) && reservation.check_out > String(params.p_check_in));
        if (!room || room.status !== 'available' || conflict) return { data: { ok: false, message: 'Selected room is no longer available.' }, error: null };
        const guest = { id: 'guest-1', hotel_id: hotel.id, phone: String(params.p_phone), full_name: String(params.p_guest_name), email: String(params.p_guest_email) };
        store.guests.push(guest);
        const reservation = { id: 'res-1', hotel_id: hotel.id, room_id: room.id, status: 'confirmed', check_in: String(params.p_check_in), check_out: String(params.p_check_out), nightly_rate: 25000, source: 'whatsapp', guest_id: guest.id, booking_reference: '3DH-WA-1' };
        store.reservations.push(reservation);
        return { data: { ok: true, message: 'Reservation created.', reservation_id: reservation.id, guest_id: guest.id, booking_reference: reservation.booking_reference, room_number: room.room_number, nightly_rate: 25000, total_amount: 50000 }, error: null };
      }
      if (name === 'create_whatsapp_paystack_intent') {
        store.payments.push({ provider: 'paystack', reference: params.p_reference, reservation_id: params.p_reservation_id });
        return { data: { ok: true, message: 'Paystack payment link generated.', payment_id: 'payment-1' }, error: null };
      }
      return { data: null, error: { message: 'unknown rpc' } };
    }
  }));

  return {
    store,
    client: {
      from: (table: keyof Store) => new QueryBuilder(store, table),
      rpc
    } as unknown as SupabaseClient,
    rpc
  };
}

const baseMessage = { id: 'wamid-1', waId: '2348012345678', from: '2348012345678', text: 'Hi' };

describe('WhatsApp Cloud API Phase 1 booking flow', () => {
  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token';
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    process.env.WHATSAPP_ACCESS_TOKEN = 'whatsapp-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-id';
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_secret';
    process.env.APP_URL = 'http://localhost:3000';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.PAYSTACK_SECRET_KEY;
    delete process.env.APP_URL;
  });

  it('verifies Meta GET webhook challenge success and failure', () => {
    expect(verifyWhatsAppWebhookChallenge(new URLSearchParams('hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc'))).toEqual({ ok: true, challenge: 'abc' });
    expect(verifyWhatsAppWebhookChallenge(new URLSearchParams('hub.mode=subscribe&hub.verify_token=bad&hub.challenge=abc'))).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects invalid webhook signatures', () => {
    const body = JSON.stringify({ object: 'whatsapp_business_account' });
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
    expect(verifyWhatsAppSignature(body, signature, 'app-secret')).toBe(true);
    expect(verifyWhatsAppSignature(body, 'sha256=bad', 'app-secret')).toBe(false);
  });

  it('starts a booking session from Hi', async () => {
    const { client, store } = createSupabase();
    const reply = await processWhatsAppMessage(client, baseMessage);
    expect(reply).toContain('Welcome to 3dHotels');
    expect(store.whatsapp_sessions[0]?.step).toBe('awaiting_check_in');
  });

  it('valid check-in advances flow and invalid date is rejected', async () => {
    const { client, store } = createSupabase({ whatsapp_sessions: [{ id: 's1', hotel_id: 'hotel-1', wa_id: baseMessage.waId, phone_number: baseMessage.from, step: 'awaiting_check_in', check_in: null, check_out: null, selected_room_id: null, selected_room_type_id: null, guest_name: null, guest_email: null, reservation_id: null, available_rooms: [] }] });
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'bad-date', text: 'Sept 6' })).resolves.toContain('valid check-in date');
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'good-date', text: '2026-09-06' })).resolves.toContain('check-out date');
    expect(store.whatsapp_sessions[0]?.step).toBe('awaiting_check_out');
  });

  it('rejects checkout before check-in', async () => {
    const { client } = createSupabase({ whatsapp_sessions: [{ id: 's1', hotel_id: 'hotel-1', wa_id: baseMessage.waId, phone_number: baseMessage.from, step: 'awaiting_check_out', check_in: '2026-09-06', check_out: null, selected_room_id: null, selected_room_type_id: null, guest_name: null, guest_email: null, reservation_id: null, available_rooms: [] }] });
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'checkout', text: '2026-09-05' })).resolves.toContain('Check-out must be after check-in');
  });

  it('availability uses live booking rules and prevents cross-hotel leakage', async () => {
    const { client } = createSupabase({ reservations: [{ id: 'res-old', hotel_id: 'hotel-1', room_id: 'room-101', status: 'confirmed', check_in: '2026-09-06', check_out: '2026-09-08' }] });
    const rooms = await getAvailableWhatsAppRooms(client, 'hotel-1', '2026-09-06', '2026-09-08');
    expect(rooms.map((room) => room.id)).toEqual(['room-102']);
    expect(rooms.map((room) => room.id)).not.toContain('room-201');
  });

  it('validates room selection', async () => {
    const { client } = createSupabase({ whatsapp_sessions: [{ id: 's1', hotel_id: 'hotel-1', wa_id: baseMessage.waId, phone_number: baseMessage.from, step: 'awaiting_room_selection', check_in: '2026-09-06', check_out: '2026-09-08', selected_room_id: null, selected_room_type_id: null, guest_name: null, guest_email: null, reservation_id: null, available_rooms: [{ id: 'room-102', roomNumber: '102', roomTypeId: 'standard', roomTypeName: 'Standard', baseRate: 25000, status: 'available' }] }] });
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'bad-room', text: '9' })).resolves.toContain('valid room option');
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'good-room', text: '1' })).resolves.toContain('What name');
  });

  it('creates one reservation and generates Paystack link after confirmation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ status: true, message: 'ok', data: { authorization_url: 'https://checkout.paystack.com/test', access_code: 'access', reference: '3DH-WA-PAY' } }) } as Response);
    const { client, store } = createSupabase({ whatsapp_sessions: [{ id: 's1', hotel_id: 'hotel-1', wa_id: baseMessage.waId, phone_number: baseMessage.from, step: 'awaiting_confirmation', check_in: '2026-09-06', check_out: '2026-09-08', selected_room_id: 'room-102', selected_room_type_id: 'standard', guest_name: 'Ada Guest', guest_email: 'ada@example.com', reservation_id: null, available_rooms: [{ id: 'room-102', roomNumber: '102', roomTypeId: 'standard', roomTypeName: 'Standard', baseRate: 25000, status: 'available' }] }] });
    const reply = await processWhatsAppMessage(client, { ...baseMessage, id: 'confirm', text: 'CONFIRM' });
    expect(reply).toContain('Complete payment here: https://checkout.paystack.com/test');
    expect(store.reservations).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
  });

  it('duplicate confirm does not create duplicate reservation', async () => {
    const { client, store } = createSupabase({ whatsapp_sessions: [{ id: 's1', hotel_id: 'hotel-1', wa_id: baseMessage.waId, phone_number: baseMessage.from, step: 'awaiting_confirmation', check_in: '2026-09-06', check_out: '2026-09-08', selected_room_id: 'room-102', selected_room_type_id: 'standard', guest_name: 'Ada Guest', guest_email: 'ada@example.com', reservation_id: 'res-existing', available_rooms: [] }] });
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'duplicate-confirm', text: 'CONFIRM' })).resolves.toContain('already been created');
    expect(store.reservations).toHaveLength(0);
  });

  it('rejects confirmation when room became unavailable', async () => {
    const { client } = createSupabase({ reservations: [{ id: 'res-old', hotel_id: 'hotel-1', room_id: 'room-102', status: 'confirmed', check_in: '2026-09-06', check_out: '2026-09-08' }], whatsapp_sessions: [{ id: 's1', hotel_id: 'hotel-1', wa_id: baseMessage.waId, phone_number: baseMessage.from, step: 'awaiting_confirmation', check_in: '2026-09-06', check_out: '2026-09-08', selected_room_id: 'room-102', selected_room_type_id: 'standard', guest_name: 'Ada Guest', guest_email: 'ada@example.com', reservation_id: null, available_rooms: [] }] });
    await expect(processWhatsAppMessage(client, { ...baseMessage, id: 'unavailable-confirm', text: 'CONFIRM' })).resolves.toContain('no longer available');
  });

  it('handles duplicate WhatsApp webhook message IDs idempotently', async () => {
    const { client, store } = createSupabase();
    await processWhatsAppMessage(client, { ...baseMessage, id: 'same-id', text: 'Hi' });
    const second = await processWhatsAppMessage(client, { ...baseMessage, id: 'same-id', text: 'Hi' });
    expect(second).toBeNull();
    expect(store.whatsapp_processed_messages).toHaveLength(1);
  });

  it('parses only strict ISO dates', () => {
    expect(parseIsoDate('2026-09-06')).toBe('2026-09-06');
    expect(parseIsoDate('2026-99-99')).toBeNull();
  });
});
