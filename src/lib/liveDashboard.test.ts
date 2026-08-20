import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveDashboardSource = readFileSync(join(process.cwd(), 'src', 'lib', 'liveDashboard.ts'), 'utf8');

describe('live dashboard data loader', () => {
  it('contains development-only sanitized Supabase diagnostics', () => {
    expect(liveDashboardSource).toContain("process.env.NODE_ENV !== 'development'");
    expect(liveDashboardSource).toContain("console.error('[dashboard:data]'");
    expect(liveDashboardSource).toContain('code: error.code');
    expect(liveDashboardSource).toContain('message: error.message');
    expect(liveDashboardSource).not.toContain('access_token');
    expect(liveDashboardSource).not.toContain('refresh_token');
    expect(liveDashboardSource).not.toContain('SUPABASE_SERVICE_ROLE');
  });
});
