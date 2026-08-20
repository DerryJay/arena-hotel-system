import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000100_initial_hotel_schema.sql'),
  'utf8'
).replace(/\s+/g, ' ');

describe('initial hotel schema migration', () => {
  it('keeps RLS enabled on tenant-scoped tables', () => {
    for (const table of ['hotels', 'staff_profiles', 'room_types', 'rooms', 'guests', 'reservations', 'housekeeping_tasks', 'folio_charges', 'payments']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('uses a transaction-safe exclusion constraint for inventory-holding reservations', () => {
    expect(migration).toContain('create extension if not exists btree_gist');
    expect(migration).toContain('constraint reservations_no_inventory_overlap exclude using gist');
    expect(migration).toContain("daterange(check_in, check_out, '[)') with &&");
    expect(migration).toContain("where (status in ('reserved', 'confirmed', 'checked_in'))");
  });

  it('prevents manager escalation through staff profile policies', () => {
    expect(migration).toContain('Managers can manage operational staff in their hotel');
    expect(migration).toContain("role in ('front_desk', 'housekeeping', 'accounting')");
    expect(migration).not.toContain('Managers can manage staff in their hotel');
  });
});
