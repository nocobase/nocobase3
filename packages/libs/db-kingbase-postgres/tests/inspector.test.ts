import { describe, expect, it, vi } from 'vitest';
import { normalizePhysicalDataType } from '@nocobase/db';
import kingbasePostgres from '../src/index.js';
import {
  KingbasePostgresSchemaInspector,
  kingbasePostgresTypes,
} from '../src/inspectors/kingbase-postgres.js';

describe('kingbasePostgres schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      kingbasePostgres.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: { schema: ['tenant'] },
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(KingbasePostgresSchemaInspector);
  });

  it('uses the configured search path to mark the default schema', async () => {
    const raw = vi
      .fn()
      .mockResolvedValue([{ name: 'public' }, { name: 'tenant' }]);
    const inspector = new KingbasePostgresSchemaInspector({
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

  it('normalizes KingbaseES PostgreSQL temporal and character types', () => {
    expect(
      normalizePhysicalDataType(
        kingbasePostgresTypes,
        'timestamp(3) with time zone',
      ),
    ).toBe('datetimeTz');
    expect(normalizePhysicalDataType(kingbasePostgresTypes, 'bpchar')).toBe(
      'char',
    );
    expect(
      normalizePhysicalDataType(kingbasePostgresTypes, 'double precision'),
    ).toBe('double');
  });
});
