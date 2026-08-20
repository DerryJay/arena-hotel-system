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
