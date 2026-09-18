import { Client, Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePostgresConnection } from '../../src/backends/postgres.js';
import { createBorrowedPostgresPool } from '../../src/backends/postgres-pool.js';

class CustomClient extends Client {}

afterEach(() => vi.restoreAllMocks());

describe('standard PostgreSQL Pool admission', () => {
  it('accepts an untouched standard Pool without acquiring any connection', async () => {
    const owner = new Pool({ connectionTimeoutMillis: 100 });
    try {
      expect(resolvePostgresConnection(owner)).toEqual({ borrowedPool: owner });
      expect(owner.totalCount).toBe(0);
    } finally {
      await owner.end();
    }
  });

  it('rejects the effective Client constructor even when options.Client is absent', async () => {
    const owner = new Pool({ connectionTimeoutMillis: 100 });
    Object.assign(owner, { Client: CustomClient });
    try {
      expect(owner.options).not.toHaveProperty('Client');
      expect(() => resolvePostgresConnection(owner)).toThrow(
        /standard pg.Client/u,
      );
      expect(owner.totalCount).toBe(0);
      expect(owner.waitingCount).toBe(0);
    } finally {
      await owner.end();
    }
  });

  it.each(['Client', 'connect', 'query', 'onConnect', 'verify'] as const)(
    'revalidates %s immediately before every checkout, not just at initial admission',
    async (field) => {
      const owner = new Pool({ connectionTimeoutMillis: 100 });
      // This no-network driver seam remains on the standard prototype so it does
      // not itself represent the unsupported per-Pool mutation under test.
      const connect = vi
        .spyOn(Pool.prototype, 'connect')
        .mockImplementation(() =>
          Promise.reject(new Error('unexpected checkout')),
        );
      const changedConnect = vi.fn(() =>
        Promise.reject(new Error('unexpected changed checkout')),
      );
      expect(resolvePostgresConnection(owner)).toEqual({ borrowedPool: owner });
      const adapter = createBorrowedPostgresPool(owner);
      if (field === 'Client') Object.assign(owner, { Client: CustomClient });
      else if (field === 'connect')
        Object.assign(owner, { connect: changedConnect });
      else if (field === 'query') Object.assign(owner, { query: vi.fn() });
      else Object.assign(owner.options, { [field]: vi.fn() });
      try {
        await expect(adapter.pool.connect()).rejects.toBeInstanceOf(TypeError);
        expect(connect).not.toHaveBeenCalled();
        expect(changedConnect).not.toHaveBeenCalled();
        expect(owner.totalCount).toBe(0);
        expect(owner.waitingCount).toBe(0);
      } finally {
        await adapter.close();
        await owner.end();
      }
    },
  );
});
