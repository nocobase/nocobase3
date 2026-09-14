import { describe, expect, it, vi } from 'vitest';
import { normalizePhysicalDataType } from '@nocobase/db';
import oracle from '../src/index.js';
import {
  OracleSchemaInspector,
  oracleTypes,
} from '../src/inspectors/oracle.js';

describe('oracle schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      oracle.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: {},
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(OracleSchemaInspector);
  });

  it('reports the current Oracle user as the schema', async () => {
    const raw = vi.fn().mockResolvedValue([{ schema_name: 'APP' }]);
    const inspector = new OracleSchemaInspector({
      connectionName: 'main',
      resolveClient: async () => ({ raw }) as never,
    });

    await expect(inspector.listSchemas()).resolves.toEqual([
      { name: 'APP', default: true },
    ]);
  });

  it('normalizes Oracle temporal and floating point types', () => {
    expect(
      normalizePhysicalDataType(oracleTypes, 'TIMESTAMP(9) WITH TIME ZONE'),
    ).toBe('datetimeTz');
    expect(normalizePhysicalDataType(oracleTypes, 'DATE')).toBe('datetime');
    expect(normalizePhysicalDataType(oracleTypes, 'FLOAT(126)')).toBe(
      'decimal',
    );
  });
});
