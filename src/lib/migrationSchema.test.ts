import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const initialMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000100_initial_hotel_schema.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const accessRpcMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000300_current_staff_hotel_access_rpc.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const grantsMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000400_grant_authenticated_hotel_table_access.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const bookingReferenceMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000500_add_reservation_booking_reference.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const checkInMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000600_add_check_in_reservation_rpc.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const roomManagementMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000700_add_room_management_rpc.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const paymentRecordingMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260821000800_add_reservation_payment_recording_rpc.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const paymentOverpaymentMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260821000900_prevent_reservation_payment_overpayments.sql'),
  'utf8'
).replace(/\s+/g, ' ');

const checkoutMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260821001000_add_checkout_reservation_rpc.sql'),
  'utf8'
).replace(/\s+/g, ' ');

describe('initial hotel schema migration', () => {
  it('keeps RLS enabled on tenant-scoped tables', () => {
    for (const table of ['hotels', 'staff_profiles', 'room_types', 'rooms', 'guests', 'reservations', 'housekeeping_tasks', 'folio_charges', 'payments']) {
      expect(initialMigration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('uses a transaction-safe exclusion constraint for inventory-holding reservations', () => {
    expect(initialMigration).toContain('create extension if not exists btree_gist');
    expect(initialMigration).toContain('constraint reservations_no_inventory_overlap exclude using gist');
    expect(initialMigration).toContain("daterange(check_in, check_out, '[)') with &&");
    expect(initialMigration).toContain("where (status in ('reserved', 'confirmed', 'checked_in'))");
  });

  it('prevents manager escalation through staff profile policies', () => {
    expect(initialMigration).toContain('Managers can manage operational staff in their hotel');
    expect(initialMigration).toContain("role in ('front_desk', 'housekeeping', 'accounting')");
    expect(initialMigration).not.toContain('Managers can manage staff in their hotel');
  });
});

describe('current staff hotel access RPC migration', () => {
  it('returns only the authenticated user staff profile joined to its hotel', () => {
    expect(accessRpcMigration).toContain('create or replace function public.get_current_staff_hotel_access()');
    expect(accessRpcMigration).toContain('security definer');
    expect(accessRpcMigration).toContain('where staff_profiles.id = auth.uid()');
    expect(accessRpcMigration).toContain('join public.hotels on hotels.id = staff_profiles.hotel_id');
  });

  it('is executable by authenticated users only through an explicit grant', () => {
    expect(accessRpcMigration).toContain('revoke all on function public.get_current_staff_hotel_access() from public');
    expect(accessRpcMigration).toContain('grant execute on function public.get_current_staff_hotel_access() to authenticated');
  });
});

describe('authenticated table grant migration', () => {
  it('grants authenticated users base table privileges needed by PostgREST while RLS remains enabled', () => {
    expect(grantsMigration).toContain('grant usage on schema public to authenticated');

    for (const table of ['hotels', 'staff_profiles', 'room_types', 'rooms', 'guests', 'reservations', 'housekeeping_tasks', 'folio_charges', 'payments']) {
      expect(grantsMigration).toContain(`grant select on table public.${table} to authenticated`);
    }
  });

  it('does not grant broad payment mutation privileges beyond existing insert policies', () => {
    expect(grantsMigration).toContain('grant insert on table public.folio_charges to authenticated');
    expect(grantsMigration).toContain('grant insert on table public.payments to authenticated');
    expect(grantsMigration).not.toContain('grant insert, update, delete on table public.payments to authenticated');
  });
});

describe('reservation booking reference migration', () => {
  it('adds a nullable unique staff-facing booking reference and insert trigger', () => {
    expect(bookingReferenceMigration).toContain('alter table public.reservations add column booking_reference text');
    expect(bookingReferenceMigration).toContain('create unique index reservations_booking_reference_key');
    expect(bookingReferenceMigration).toContain("'3DH-' || to_char(current_date, 'YYYYMMDD')");
    expect(bookingReferenceMigration).toContain('create trigger reservations_set_booking_reference');
  });
});

describe('check-in reservation RPC migration', () => {
  it('keeps check-in hotel-scoped and limited to authorised operations roles', () => {
    expect(checkInMigration).toContain('create or replace function public.check_in_reservation(p_reservation_id uuid)');
    expect(checkInMigration).toContain('security invoker');
    expect(checkInMigration).toContain("v_staff_role not in ('owner', 'front_desk')");
    expect(checkInMigration).toContain('reservations.hotel_id = v_staff_hotel_id');
    expect(checkInMigration).toContain('rooms.hotel_id = v_staff_hotel_id');
  });

  it('locks reservation and room rows before atomically updating both states', () => {
    expect(checkInMigration).toContain('for update of reservations, rooms');
    expect(checkInMigration).toContain("set status = 'checked_in'");
    expect(checkInMigration).toContain("set status = 'occupied'");
  });

  it('rejects ineligible reservations and blocked operational room states', () => {
    expect(checkInMigration).toContain("v_reservation.status not in ('confirmed', 'reserved')");
    expect(checkInMigration).toContain("v_reservation.room_status in ('maintenance', 'blocked')");
    expect(checkInMigration).toContain('grant execute on function public.check_in_reservation(uuid) to authenticated');
  });
});

describe('room management RPC migration', () => {
  it('creates an authenticated hotel-scoped room management function', () => {
    expect(roomManagementMigration).toContain('create or replace function public.manage_room(');
    expect(roomManagementMigration).toContain('security definer');
    expect(roomManagementMigration).toContain('staff_profiles.id = auth.uid()');
    expect(roomManagementMigration).toContain("v_staff_role not in ('owner', 'front_desk')");
    expect(roomManagementMigration).toContain('rooms.hotel_id = v_staff_hotel_id');
    expect(roomManagementMigration).toContain('room_types.hotel_id = v_staff_hotel_id');
  });

  it('protects occupied rooms and duplicate room numbers at the database boundary', () => {
    expect(roomManagementMigration).toContain("v_room.status = 'occupied' and p_status <> 'occupied'");
    expect(roomManagementMigration).toContain("v_room.status <> 'occupied' and p_status = 'occupied'");
    expect(roomManagementMigration).toContain('when unique_violation then');
    expect(roomManagementMigration).toContain('A room with this number already exists for this hotel.');
  });

  it('updates room type rate and capacity through the existing room_types model', () => {
    expect(roomManagementMigration).toContain('update public.room_types');
    expect(roomManagementMigration).toContain('base_rate = p_base_rate');
    expect(roomManagementMigration).toContain('max_occupancy = p_max_occupancy');
    expect(roomManagementMigration).toContain('grant execute on function public.manage_room');
  });
});

describe('reservation payment recording RPC migration', () => {
  it('adds payment notes and duplicate submission protection', () => {
    expect(paymentRecordingMigration).toContain('add column if not exists notes text');
    expect(paymentRecordingMigration).toContain('add column if not exists idempotency_key text');
    expect(paymentRecordingMigration).toContain('create unique index if not exists payments_hotel_idempotency_key_idx');
    expect(paymentRecordingMigration).toContain('on public.payments(hotel_id, idempotency_key)');
  });

  it('records payments only for the authenticated staff hotel', () => {
    expect(paymentRecordingMigration).toContain('create or replace function public.record_reservation_payment(');
    expect(paymentRecordingMigration).toContain('security invoker');
    expect(paymentRecordingMigration).toContain('v_staff_hotel_id := public.current_staff_hotel_id()');
    expect(paymentRecordingMigration).toContain("v_staff_role not in ('owner', 'front_desk')");
    expect(paymentRecordingMigration).toContain('reservations.hotel_id = v_staff_hotel_id');
    expect(paymentRecordingMigration).toContain('for update');
  });

  it('rejects invalid amounts and returns existing payments for duplicate keys', () => {
    expect(paymentRecordingMigration).toContain('p_amount is null or p_amount <= 0');
    expect(paymentRecordingMigration).toContain('Payment amount must be greater than zero.');
    expect(paymentRecordingMigration).toContain('Payment already recorded.');
    expect(paymentRecordingMigration).toContain('grant execute on function public.record_reservation_payment');
  });
});

describe('reservation payment overpayment prevention migration', () => {
  it('replaces the payment RPC with outstanding balance enforcement', () => {
    expect(paymentOverpaymentMigration).toContain('create or replace function public.record_reservation_payment(');
    expect(paymentOverpaymentMigration).toContain('v_stay_value := greatest(0, v_reservation.check_out - v_reservation.check_in) * v_reservation.nightly_rate');
    expect(paymentOverpaymentMigration).toContain("payments.status in ('paid', 'partially_paid')");
    expect(paymentOverpaymentMigration).toContain('if p_amount > v_balance then');
    expect(paymentOverpaymentMigration).toContain('Payment amount cannot exceed the outstanding balance.');
  });
});

describe('checkout reservation RPC migration', () => {
  it('adds checkout audit balance and authorised hotel-scoped checkout RPC', () => {
    expect(checkoutMigration).toContain('add column if not exists checkout_balance_due numeric');
    expect(checkoutMigration).toContain('create or replace function public.checkout_reservation(');
    expect(checkoutMigration).toContain('security invoker');
    expect(checkoutMigration).toContain("v_staff_role not in ('owner', 'front_desk')");
    expect(checkoutMigration).toContain('reservations.hotel_id = v_staff_hotel_id');
    expect(checkoutMigration).toContain('rooms.hotel_id = v_staff_hotel_id');
  });

  it('locks reservation and room rows, rejects non-checked-in reservations, and requires balance confirmation', () => {
    expect(checkoutMigration).toContain('for update of reservations, rooms');
    expect(checkoutMigration).toContain("v_reservation.status <> 'checked_in'");
    expect(checkoutMigration).toContain('v_balance > 0 and not p_confirm_balance_due');
    expect(checkoutMigration).toContain('Outstanding balance requires confirmation before checkout.');
  });

  it('checks out reservation, moves room to cleaning, and creates one checkout cleaning task', () => {
    expect(checkoutMigration).toContain("status = 'checked_out'");
    expect(checkoutMigration).toContain("set status = 'cleaning'");
    expect(checkoutMigration).toContain("housekeeping_tasks.status in ('todo', 'in_progress')");
    expect(checkoutMigration).toContain('Created from checkout for');
    expect(checkoutMigration).toContain('insert into public.housekeeping_tasks');
  });

  it('keeps payment overpayment protection aligned to folio-inclusive balances', () => {
    expect(checkoutMigration).toContain('create or replace function public.record_reservation_payment(');
    expect(checkoutMigration).toContain('v_stay_value + v_folio_total - v_amount_paid');
    expect(checkoutMigration).toContain('Payment amount cannot exceed the outstanding balance.');
  });
});
