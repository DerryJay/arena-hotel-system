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
