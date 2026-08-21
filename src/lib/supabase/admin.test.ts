import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const adminClientSource = readFileSync(join(process.cwd(), 'src', 'lib', 'supabase', 'admin.ts'), 'utf8');

describe('server-only Supabase admin client', () => {
  it('uses a separate non-session Supabase client for trusted server processing', () => {
    expect(adminClientSource).toContain("import { createClient } from '@supabase/supabase-js'");
    expect(adminClientSource).toContain('process.env.SUPABASE_SECRET_KEY');
    expect(adminClientSource).toContain('persistSession: false');
    expect(adminClientSource).toContain('autoRefreshToken: false');
    expect(adminClientSource).toContain('detectSessionInUrl: false');
    expect(adminClientSource).not.toContain('@supabase/ssr');
    expect(adminClientSource).not.toContain('cookies()');
  });
});
