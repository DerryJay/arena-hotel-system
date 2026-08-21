import type { SupabaseClient } from '@supabase/supabase-js';
import type { StaffHotelAccessRecord } from './auth/access';
import { getStayNights } from './dashboardMetrics';
import type { PaymentStatus, ReservationStatus } from './types';

export type ReservationPaymentStatus = 'unpaid' | 'part_paid' | 'paid';
export type ReservationPaymentMethod = 'cash' | 'bank_transfer' | 'pos_card';

export interface ReservationListItem {
  id: string;
  bookingReference: string;
  guestName: string;
  guestPhone: string;
  guestEmail: string;
  roomNumber: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  nightlyRate: number;
  stayValue: number;
  amountPaid: number;
  balance: number;
  reservationStatus: ReservationStatus;
  paymentStatus: ReservationPaymentStatus;
  adults: number;
  children: number;
  source: string;
  createdAt: string;
}

export interface ReservationPaymentRecord {
  id: string;
  amount: number;
  method: string;
  reference: string;
  notes: string;
  status: PaymentStatus;
  postedAt: string;
}

export interface ReservationDetails extends ReservationListItem {
  payments: ReservationPaymentRecord[];
}

export interface ReservationsManagementData {
  reservations: ReservationListItem[];
  selectedReservation?: ReservationDetails;
}

export interface RecordPaymentInput {
  reservationId: string;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  idempotencyKey: string;
  outstandingBalance?: number;
}

export interface RecordPaymentResult {
  ok: boolean;
  message: string;
  paymentId?: string;
}

export interface PaymentSafetyState {
  accessHotelId: string | null;
  role: string;
  reservationHotelId: string;
  amount: number;
  idempotencyKey: string;
  outstandingBalance: number;
}

type ReservationRow = {
  id: string;
  booking_reference: string | null;
  status: ReservationStatus;
  check_in: string;
  check_out: string;
  adults: number | null;
  children: number | null;
  nightly_rate: number | string;
  source: string | null;
  created_at: string;
  guests: {
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  rooms: {
    room_number: string;
    room_types: {
      name: string;
    } | null;
  } | null;
};

type PaymentRow = {
  id: string;
  reservation_id: string;
  amount: number | string;
  method: string;
  reference: string | null;
  notes: string | null;
  status: PaymentStatus;
  posted_at: string;
};

type RecordPaymentRpcRow = {
  ok: boolean;
  message: string;
  payment_id: string | null;
};

const paymentWriterRoles = new Set(['owner', 'front_desk']);
const validPaymentMethods = new Set<ReservationPaymentMethod>(['cash', 'bank_transfer', 'pos_card']);
const validPaymentStatuses = new Set<PaymentStatus>(['paid', 'partially_paid']);

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  return 0;
}

export function isAuthorizedPaymentRecorder(role: string): boolean {
  return paymentWriterRoles.has(role);
}

export function normalizePaymentMethod(method: string): ReservationPaymentMethod | null {
  const normalized = method.trim().toLowerCase();
  return validPaymentMethods.has(normalized as ReservationPaymentMethod) ? normalized as ReservationPaymentMethod : null;
}

export function getReservationPaymentStatus(stayValue: number, amountPaid: number): ReservationPaymentStatus {
  if (amountPaid <= 0) {
    return 'unpaid';
  }

  if (amountPaid < stayValue) {
    return 'part_paid';
  }

  return 'paid';
}

export function getValidPaymentTotal(payments: Pick<PaymentRow, 'amount' | 'status'>[]): number {
  return payments
    .filter((payment) => validPaymentStatuses.has(payment.status))
    .reduce((total, payment) => total + toNumber(payment.amount), 0);
}

export function validatePaymentInput(input: RecordPaymentInput): { ok: true; method: ReservationPaymentMethod } | { ok: false; message: string } {
  if (!input.reservationId) {
    return { ok: false, message: 'Reservation is required.' };
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: 'Payment amount must be greater than zero.' };
  }

  if (input.outstandingBalance !== undefined && input.amount > input.outstandingBalance) {
    return { ok: false, message: 'Payment amount cannot exceed the outstanding balance.' };
  }

  const method = normalizePaymentMethod(input.method);

  if (!method) {
    return { ok: false, message: 'Invalid payment method.' };
  }

  if (!input.idempotencyKey.trim()) {
    return { ok: false, message: 'Payment request key is required.' };
  }

  return { ok: true, method };
}

export function validatePaymentSafety(state: PaymentSafetyState): { ok: true } | { ok: false; message: string } {
  if (!state.accessHotelId || !isAuthorizedPaymentRecorder(state.role)) {
    return { ok: false, message: 'You are not authorised to record payments.' };
  }

  if (state.reservationHotelId !== state.accessHotelId) {
    return { ok: false, message: 'Reservation not found for this hotel.' };
  }

  if (!Number.isFinite(state.amount) || state.amount <= 0) {
    return { ok: false, message: 'Payment amount must be greater than zero.' };
  }

  if (state.amount > state.outstandingBalance) {
    return { ok: false, message: 'Payment amount cannot exceed the outstanding balance.' };
  }

  if (!state.idempotencyKey.trim()) {
    return { ok: false, message: 'Payment request key is required.' };
  }

  return { ok: true };
}

function mapReservation(row: ReservationRow, payments: PaymentRow[]): ReservationListItem {
  const nightlyRate = toNumber(row.nightly_rate);
  const nights = getStayNights(row.check_in, row.check_out);
  const stayValue = nights * nightlyRate;
  const amountPaid = getValidPaymentTotal(payments);

  return {
    id: row.id,
    bookingReference: row.booking_reference ?? 'Pending reference',
    guestName: row.guests?.full_name ?? 'Unknown guest',
    guestPhone: row.guests?.phone ?? '',
    guestEmail: row.guests?.email ?? '',
    roomNumber: row.rooms?.room_number ?? 'Unassigned',
    roomTypeName: row.rooms?.room_types?.name ?? 'Unassigned',
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights,
    nightlyRate,
    stayValue,
    amountPaid,
    balance: Math.max(0, stayValue - amountPaid),
    reservationStatus: row.status,
    paymentStatus: getReservationPaymentStatus(stayValue, amountPaid),
    adults: row.adults ?? 1,
    children: row.children ?? 0,
    source: row.source ?? 'front_desk',
    createdAt: row.created_at
  };
}

function matchesSearch(reservation: ReservationListItem, search: string): boolean {
  const normalized = search.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return [reservation.bookingReference, reservation.guestName, reservation.guestPhone, reservation.roomNumber]
    .some((value) => value.toLowerCase().includes(normalized));
}

export async function getReservationsManagementData(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  filters: { search?: string; status?: string; reservationId?: string } = {}
): Promise<ReservationsManagementData> {
  if (!access.hotel_id) {
    throw new Error('Authenticated staff profile is missing a hotel id.');
  }

  const [reservationsResponse, paymentsResponse] = await Promise.all([
    supabase
      .from('reservations')
      .select('id, booking_reference, status, check_in, check_out, adults, children, nightly_rate, source, created_at, guests(full_name, phone, email), rooms(room_number, room_types(name))')
      .eq('hotel_id', access.hotel_id)
      .order('check_in', { ascending: false }),
    supabase
      .from('payments')
      .select('id, reservation_id, amount, method, reference, notes, status, posted_at')
      .eq('hotel_id', access.hotel_id)
      .order('posted_at', { ascending: false })
  ]);

  if (reservationsResponse.error) {
    throw new Error(`Unable to load reservations: ${reservationsResponse.error.message}`);
  }

  if (paymentsResponse.error) {
    throw new Error(`Unable to load payments: ${paymentsResponse.error.message}`);
  }

  const payments = (paymentsResponse.data ?? []) as unknown as PaymentRow[];
  const paymentsByReservation = payments.reduce((grouped, payment) => {
    const existing = grouped.get(payment.reservation_id) ?? [];
    existing.push(payment);
    grouped.set(payment.reservation_id, existing);
    return grouped;
  }, new Map<string, PaymentRow[]>());

  const allReservations = ((reservationsResponse.data ?? []) as unknown as ReservationRow[])
    .map((reservation) => mapReservation(reservation, paymentsByReservation.get(reservation.id) ?? []));

  const filteredReservations = allReservations
    .filter((reservation) => !filters.status || reservation.reservationStatus === filters.status)
    .filter((reservation) => matchesSearch(reservation, filters.search ?? ''));

  const selectedListItem = filters.reservationId
    ? allReservations.find((reservation) => reservation.id === filters.reservationId)
    : filteredReservations[0];

  const selectedReservation = selectedListItem
    ? {
        ...selectedListItem,
        payments: (paymentsByReservation.get(selectedListItem.id) ?? []).map((payment) => ({
          id: payment.id,
          amount: toNumber(payment.amount),
          method: payment.method,
          reference: payment.reference ?? '',
          notes: payment.notes ?? '',
          status: payment.status,
          postedAt: payment.posted_at
        }))
      }
    : undefined;

  return {
    reservations: filteredReservations,
    selectedReservation
  };
}

export async function recordReservationPayment(
  supabase: SupabaseClient,
  access: StaffHotelAccessRecord,
  input: RecordPaymentInput
): Promise<RecordPaymentResult> {
  if (!access.hotel_id || !isAuthorizedPaymentRecorder(access.role)) {
    return { ok: false, message: 'You are not authorised to record payments.' };
  }

  const validation = validatePaymentInput(input);

  if (!validation.ok) {
    return validation;
  }

  const response = await supabase
    .rpc('record_reservation_payment', {
      p_reservation_id: input.reservationId,
      p_amount: input.amount,
      p_method: validation.method,
      p_reference: input.reference?.trim() || null,
      p_notes: input.notes?.trim() || null,
      p_idempotency_key: input.idempotencyKey.trim()
    })
    .single<RecordPaymentRpcRow>();

  if (response.error) {
    const isDuplicate = response.error.code === '23505' || response.error.message.toLowerCase().includes('duplicate');
    return {
      ok: false,
      message: isDuplicate ? 'Payment already recorded.' : `Unable to record payment: ${response.error.message}`
    };
  }

  return {
    ok: response.data.ok,
    message: response.data.message,
    paymentId: response.data.payment_id ?? undefined
  };
}
