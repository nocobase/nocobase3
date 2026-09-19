import { describe, expect, it, vi } from 'vitest';
import { normalizePhysicalDataType } from '@nocobase/db';
import kingbase from '../src/index.js';
import {
  KingbaseSchemaInspector,
  kingbaseTypes,
} from '../src/inspectors/kingbase.js';

describe('kingbase schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      kingbase.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: { schema: ['tenant'] },
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(KingbaseSchemaInspector);
  });

  it('uses the configured search path to mark the default schema', async () => {
    const raw = vi
      .fn()
      .mockResolvedValue([{ name: 'public' }, { name: 'tenant' }]);
    const inspector = new KingbaseSchemaInspector({
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
      normalizePhysicalDataType(kingbaseTypes, 'timestamp(3) with time zone'),
    ).toBe('datetimeTz');
    expect(normalizePhysicalDataType(kingbaseTypes, 'bpchar')).toBe('char');
    expect(normalizePhysicalDataType(kingbaseTypes, 'double precision')).toBe(
      'double',
    );
  });
});
