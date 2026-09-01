import { describe, expect, it, vi } from 'vitest';
import {
  SchemaManagementNotAllowedError,
  SchemaManagementSchemaAdapter,
} from '../../../src/database/index.js';
import {
  NoopSchemaAdapter,
  type SchemaAdapter,
} from '../../../src/schema/index.js';

describe('NoopSchemaAdapter', () => {
  it('accepts schema operations without executing anything', async () => {
    const adapter: SchemaAdapter = new NoopSchemaAdapter();

    await expect(
      adapter.execute([
        {
          type: 'dropTable',
          tableName: 'legacy_logs',
        },
      ]),
    ).resolves.toBeUndefined();
    await expect(adapter.compile!([])).resolves.toEqual([]);
  });
});

describe('SchemaManagementSchemaAdapter', () => {
  it('delegates schema execution for managed connections', async () => {
    const execute = vi.fn<SchemaAdapter['execute']>(async () => undefined);
    const adapter = new SchemaManagementSchemaAdapter(
      { dialect: 'sqlite', execute },
      { connectionName: 'main', mode: 'managed' },
    );
    const operations = [
      { type: 'dropTable', tableName: 'legacy_logs' },
    ] as const;

    await expect(adapter.execute([...operations])).resolves.toBeUndefined();
    expect(adapter.dialect).toBe('sqlite');
    expect(execute).toHaveBeenCalledExactlyOnceWith([...operations]);
  });

  it('allows compilation but rejects schema execution for external connections', async () => {
    const execute = vi.fn<SchemaAdapter['execute']>(async () => undefined);
    const compile = vi.fn<NonNullable<SchemaAdapter['compile']>>(async () => [
      'drop table legacy_logs',
    ]);
    const adapter = new SchemaManagementSchemaAdapter(
      { execute, compile },
      { connectionName: 'analytics', mode: 'external' },
    );
    const operations = [
      { type: 'dropTable', tableName: 'legacy_logs' },
    ] as const;

    await expect(adapter.compile([...operations])).resolves.toEqual([
      'drop table legacy_logs',
    ]);
    await expect(adapter.execute([...operations])).rejects.toMatchObject({
      code: 'SCHEMA_MANAGEMENT_NOT_ALLOWED',
      connection: 'analytics',
      operation: 'dropTable',
    });
    await expect(adapter.execute([])).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledExactlyOnceWith([]);
    expect(compile).toHaveBeenCalledExactlyOnceWith([...operations]);
  });

  it('exposes a dedicated error type', () => {
    const error = new SchemaManagementNotAllowedError(
      'analytics',
      'migration.latest',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SchemaManagementNotAllowedError');
    expect(error.message).toContain('external schema management');
  });
});
