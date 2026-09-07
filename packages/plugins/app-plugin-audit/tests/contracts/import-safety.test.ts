import { describe, expect, it, vi } from 'vitest';

vi.mock('@nocobase/db', () => {
  throw new Error('Contracts must not import database runtime');
});
vi.mock('hono', () => {
  throw new Error('Contracts must not initialize HTTP runtime');
});

describe('side-effect-free public contracts', () => {
  it('imports server and browser contracts without loading runtime dependencies', async () => {
    expect(
      Object.keys(await import('@nocobase/app-plugin-audit/server/contracts')),
    ).toEqual([]);
    expect(
      Object.keys(await import('@nocobase/app-plugin-audit/client/contracts')),
    ).toEqual([]);
  });
  it('imports the token without connecting a store or starting collectors', async () => {
    const { auditServiceToken } =
      await import('@nocobase/app-plugin-audit/server/tokens');
    expect(auditServiceToken.name).toBe('@nocobase/app-plugin-audit/service');
  });
});
