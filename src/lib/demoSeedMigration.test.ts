import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const seedMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260820000200_seed_3dhotels_demo_inventory.sql'),
  'utf8'
);

const normalizedSeedMigration = seedMigration.replace(/\s+/g, ' ');

describe('3dHotels demo inventory seed migration', () => {
  it('seeds the expected hotel identity and contact details', () => {
    expect(seedMigration).toContain("'3dHotels'");
    expect(seedMigration).toContain("'3dhotels'");
    expect(seedMigration).toContain("'Onitsha, Anambra'");
    expect(seedMigration).toContain("'+234070239004'");
    expect(seedMigration).toContain("'Africa/Lagos'");
  });

  it('seeds the three requested room types with rates and occupancy', () => {
    expect(seedMigration).toContain("('Standard', 25000.00, 2)");
    expect(seedMigration).toContain("('Deluxe', 35000.00, 2)");
    expect(seedMigration).toContain("('Executive', 45000.00, 3)");
  });

  it('seeds exactly 21 demo rooms and no transactional records', () => {
    const roomNumbers = [...seedMigration.matchAll(/'([123]0[1-7])'/g)].map((match) => match[1]);

    expect(new Set(roomNumbers)).toHaveLength(21);
    expect(normalizedSeedMigration).not.toContain('insert into public.guests');
    expect(normalizedSeedMigration).not.toContain('insert into public.reservations');
    expect(normalizedSeedMigration).not.toContain('insert into public.payments');
    expect(normalizedSeedMigration).not.toContain('insert into public.staff_profiles');
  });

  it('is idempotent for hotel, room types, and rooms', () => {
    expect(normalizedSeedMigration).toContain('on conflict (slug) do update');
    expect(normalizedSeedMigration).toContain('on conflict (hotel_id, name) do update');
    expect(normalizedSeedMigration).toContain('on conflict (hotel_id, room_number) do update');
  });
});
