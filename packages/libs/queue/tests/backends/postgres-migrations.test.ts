import { SchemaVersionMismatchError } from 'bullmq';
import { Client, Pool, type PoolClient } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPostgresMigrationResource } from '../../src/backends/postgres-migrations.js';
import { postgresDeadline } from '../../src/backends/postgres-pool.js';

// Only the public driver checkout/query seam is scripted. The production
// resource and official migrator execute unchanged, without a database.
function fixture(
  options: {
    incompatible?: boolean;
    queryFailure?: { text: string; error: unknown };
    rollbackFailure?: { error: unknown };
    releaseFailure?: { error: unknown };
  } = {},
) {
  const statements: string[] = [];
  const scopes: (number | undefined)[] = [];
  const release = vi.fn(() => {
    if (options.releaseFailure) throw options.releaseFailure.error;
  });
  const raw: PoolClient = Object.assign(new Client(), { release });
  vi.spyOn(raw, 'query').mockImplementation((text) => {
    statements.push(text);
    scopes.push(postgresDeadline.getStore());
    if (text === 'ROLLBACK' && options.rollbackFailure)
      return Promise.reject(options.rollbackFailure.error);
    if (options.queryFailure && text === options.queryFailure.text)
      return Promise.reject(options.queryFailure.error);
    if (text.includes('pg_postmaster_start_time'))
      return Promise.resolve({
        rows: [
          {
            database: 'unit',
            address: '127.0.0.1',
            port: 5432,
            started: 'unit',
          },
        ],
      });
    if (text.includes("current_setting('server_version_num') AS num"))
      return Promise.resolve({ rows: [{ num: '160000', ver: '16.0' }] });
    if (text.includes('MAX(version)'))
      return Promise.resolve({ rows: [{ version: 999 }] });
    if (text.includes('MAX(min_client_version)'))
      return Promise.resolve({
        rows: [{ min_client_version: options.incompatible ? 999 : 6 }],
      });
    return Promise.resolve({ rows: [] });
  });
  vi.spyOn(Pool.prototype, 'connect').mockImplementation(() =>
    Promise.resolve(raw),
  );
  const deadline = performance.now() + 10000;
  const resource = createPostgresMigrationResource(
    { schema: 'unit' },
    deadline,
    new Set(),
  );
  return { resource, release, statements, scopes, deadline };
}

afterEach(() => vi.restoreAllMocks());

describe('PostgreSQL migration error preservation', () => {
  it('includes statement-timeout configuration queries in the migration scope', async () => {
    const f = fixture();
    try {
      await f.resource.run();
      expect(f.scopes).not.toHaveLength(0);
      expect(f.scopes).toEqual(f.statements.map(() => f.deadline));
    } finally {
      await f.resource.close();
    }
  });

  it('retains the official non-query compatibility error when rollback fails', async () => {
    const rollback = new Error('rollback transport failed');
    const f = fixture({
      incompatible: true,
      rollbackFailure: { error: rollback },
    });
    try {
      await expect(f.resource.run()).rejects.toMatchObject({
        errors: [expect.any(SchemaVersionMismatchError), rollback],
      });
      expect(f.statements).toContain('ROLLBACK');
      expect(f.statements).not.toContain('COMMIT');
      expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
      await f.resource.close();
    }
  });

  it('retains the initiating error, rollback error and release error in order', async () => {
    const rollback = new Error('rollback failed');
    const release = new Error('release failed');
    const f = fixture({
      incompatible: true,
      rollbackFailure: { error: rollback },
      releaseFailure: { error: release },
    });
    try {
      await expect(f.resource.run()).rejects.toMatchObject({
        errors: [expect.any(SchemaVersionMismatchError), rollback, release],
      });
    } finally {
      await f.resource.close();
    }
  });

  it.each(['COMMIT', 'SELECT pg_advisory_xact_lock($1, hashtext($2))'])(
    'retains SQL failure at %s and rollback failure',
    async (text) => {
      const primary = new Error('SQL failed');
      const rollback = new Error('rollback failed');
      const f = fixture({
        queryFailure: { text, error: primary },
        rollbackFailure: { error: rollback },
      });
      try {
        await expect(f.resource.run()).rejects.toMatchObject({
          errors: [primary, rollback],
        });
        expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
      } finally {
        await f.resource.close();
      }
    },
  );

  it('preserves undefined rejection reasons rather than using undefined as an absence sentinel', async () => {
    const f = fixture({
      queryFailure: { text: 'COMMIT', error: undefined },
      rollbackFailure: { error: undefined },
    });
    try {
      await expect(f.resource.run()).rejects.toMatchObject({
        errors: [undefined, undefined],
      });
    } finally {
      await f.resource.close();
    }
  });

  it('keeps a lone compatibility failure unchanged after a successful rollback', async () => {
    const f = fixture({ incompatible: true });
    try {
      await expect(f.resource.run()).rejects.toBeInstanceOf(
        SchemaVersionMismatchError,
      );
      expect(f.statements).toContain('ROLLBACK');
      expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
      await f.resource.close();
    }
  });

  it('succeeds without rolling back when migration and release succeed', async () => {
    const f = fixture();
    try {
      await expect(f.resource.run()).resolves.toBeUndefined();
      expect(f.statements).toContain('COMMIT');
      expect(f.statements).not.toContain('ROLLBACK');
      expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
    } finally {
      await f.resource.close();
    }
  });
});
