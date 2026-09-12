import { describe, expect, it, vi } from 'vitest';
import { normalizePhysicalDataType } from '@nocobase/db';
import oceanbaseMysql from '../src/index.js';
import { MysqlSchemaInspector, mysqlTypes } from '../src/inspectors/mysql.js';

describe('mysql schema inspector', () => {
  it('is wired into the public driver descriptor', () => {
    expect(
      oceanbaseMysql.driver.createSchemaInspector?.({
        connectionName: 'main',
        config: { database: 'app' },
        resolveClient: async () => ({}) as never,
      } as never),
    ).toBeInstanceOf(MysqlSchemaInspector);
  });

  it('reports the selected database as the only schema', async () => {
    const raw = vi.fn().mockResolvedValue([{ database_name: 'app' }]);
    const inspector = new MysqlSchemaInspector({
      connectionName: 'main',
      resolveClient: async () => ({ raw }) as never,
    });

    await expect(inspector.listSchemas()).resolves.toEqual([
      { name: 'app', default: true },
    ]);
  });

  it('rejects inspection of a database other than the selected one', async () => {
    const raw = vi.fn().mockResolvedValue([{ database_name: 'app' }]);
    const inspector = new MysqlSchemaInspector({
      connectionName: 'main',
      resolveClient: async () => ({ raw }) as never,
    });

    await expect(
      inspector.getPhysicalCollection({ schema: 'other', tableName: 'items' }),
    ).rejects.toMatchObject({
      code: 'SCHEMA_INSPECTION_INVALID_OPTIONS',
      schema: 'other',
    });
  });

  it('normalizes OceanBase MySQL temporal and unsigned numeric types', () => {
    expect(normalizePhysicalDataType(mysqlTypes, 'timestamp(6)')).toBe(
      'datetimeTz',
    );
    expect(normalizePhysicalDataType(mysqlTypes, 'float')).toBe('float');
    expect(mysqlTypes.temporalPrecision?.('datetime', 'datetime')).toBe(0);
  });
});
