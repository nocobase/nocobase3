import { describe, expect, it, vi } from 'vitest';
import { normalizePhysicalDataType } from '@nocobase/db';
import mssql from '../src/index.js';
import { MssqlSchemaInspector, mssqlTypes } from '../src/inspectors/mssql.js';

describe('mssql schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      mssql.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: {},
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(MssqlSchemaInspector);
  });

  it('reports SQL Server schemas and the current schema as default', async () => {
    const raw = vi
      .fn()
      .mockImplementation((sql: string) =>
        sql.includes('schema_name()')
          ? [{ schema_name: 'app' }]
          : [{ schema_name: 'app' }, { schema_name: 'dbo' }],
      );
    const inspector = new MssqlSchemaInspector({
      connectionName: 'main',
      resolveClient: async () => ({ raw }) as never,
    });

    await expect(inspector.listSchemas()).resolves.toEqual([
      { name: 'app', default: true },
      { name: 'dbo', default: false },
    ]);
  });

  it('normalizes SQL Server native types without confusing timestamp with time', () => {
    expect(normalizePhysicalDataType(mssqlTypes, 'datetimeoffset(7)')).toBe(
      'datetimeTz',
    );
    expect(normalizePhysicalDataType(mssqlTypes, 'nvarchar(max)')).toBe('text');
    expect(normalizePhysicalDataType(mssqlTypes, 'timestamp')).toBe('blob');
  });
});
