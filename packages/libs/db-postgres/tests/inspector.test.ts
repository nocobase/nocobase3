import { describe, expect, it, vi } from 'vitest';
import { normalizePhysicalDataType } from '@nocobase/db';
import postgres from '../src/index.js';
import {
  PostgresSchemaInspector,
  postgresTypes,
} from '../src/inspectors/postgres.js';

describe('postgres schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      postgres.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: { schema: ['tenant'] },
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(PostgresSchemaInspector);
  });

  it('uses the configured search path to mark the default schema', async () => {
    const raw = vi
      .fn()
      .mockResolvedValue([{ name: 'public' }, { name: 'tenant' }]);
    const inspector = new PostgresSchemaInspector({
      connectionName: 'main',
      searchPath: ['tenant', 'public'],
      resolveClient: async () => ({ raw }) as never,
    });

    await expect(inspector.listSchemas()).resolves.toEqual([
      { name: 'public', default: false },
      { name: 'tenant', default: true },
    ]);
    expect(raw).toHaveBeenCalledOnce();
  });

  it('normalizes PostgreSQL temporal and character types', () => {
    expect(
      normalizePhysicalDataType(postgresTypes, 'timestamp(3) with time zone'),
    ).toBe('datetimeTz');
    expect(normalizePhysicalDataType(postgresTypes, 'bpchar')).toBe('char');
    expect(normalizePhysicalDataType(postgresTypes, 'double precision')).toBe(
      'double',
    );
  });
});
