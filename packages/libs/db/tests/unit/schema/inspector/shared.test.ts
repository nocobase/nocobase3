import { describe, expect, it } from 'vitest';
import { BaseSchemaInspector } from '../../../../src/schema/inspector/base.js';
import {
  decodePhysicalCollectionCursor,
  encodePhysicalCollectionCursor,
  sameCursorFilter,
} from '../../../../src/schema/inspector/shared/cursor.js';
import {
  normalizePhysicalDataType,
  normalizeReferentialAction,
  parseColumnDefault,
} from '../../../../src/schema/inspector/shared/type-normalization.js';
import type {
  ListPhysicalCollectionsOptions,
  PhysicalCollectionIdentifier,
  PhysicalCollectionSchema,
  PhysicalCollectionSummary,
  PhysicalSchemaInfo,
} from '../../../../src/schema/inspector/types.js';

class TestSchemaInspector extends BaseSchemaInspector {
  readonly calls: Array<{ limit: number }> = [];

  constructor() {
    super('test', 'sqlite');
  }

  protected async inspectSchemas(): Promise<PhysicalSchemaInfo[]> {
    return [{ name: 'main', default: true }];
  }

  protected async inspectCollection(
    _identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined> {
    return undefined;
  }

  protected async inspectCollectionSummaries(options: {
    readonly limit: number;
  }): Promise<PhysicalCollectionSummary[]> {
    this.calls.push({ limit: options.limit });
    return [];
  }
}

class FailingSchemaInspector extends BaseSchemaInspector {
  constructor(private readonly failure: unknown) {
    super('failing', 'postgres');
  }

  protected async inspectSchemas(): Promise<PhysicalSchemaInfo[]> {
    throw this.failure;
  }

  protected async inspectCollection(
    _identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined> {
    throw this.failure;
  }

  protected async inspectCollectionSummaries(): Promise<
    PhysicalCollectionSummary[]
  > {
    throw this.failure;
  }
}

class DeadlockingMssqlSchemaInspector extends BaseSchemaInspector {
  attempts = 0;

  constructor(private readonly failures: number) {
    super('mssql', 'mssql');
  }

  protected async inspectSchemas(): Promise<PhysicalSchemaInfo[]> {
    this.attempts += 1;
    if (this.attempts <= this.failures) {
      throw Object.assign(new Error('deadlock victim'), { number: 1205 });
    }
    return [{ name: 'dbo', default: true }];
  }

  protected async inspectCollection(
    _identifier: PhysicalCollectionIdentifier,
  ): Promise<PhysicalCollectionSchema | undefined> {
    return undefined;
  }

  protected async inspectCollectionSummaries(): Promise<
    PhysicalCollectionSummary[]
  > {
    return [];
  }
}

describe('SchemaInspector cursor helpers', () => {
  it('round-trips an opaque cursor and compares its filter', () => {
    const filter = {
      schemas: ['main'],
      tableNamePrefixes: ['app_'],
      kinds: ['table'],
    };
    const encoded = encodePhysicalCollectionCursor({
      after: { schema: 'main', tableName: 'app_orders' },
      filter,
    });

    expect(encoded).not.toContain('app_orders');
    expect(decodePhysicalCollectionCursor(encoded)).toEqual({
      after: { schema: 'main', tableName: 'app_orders' },
      filter,
    });
    expect(sameCursorFilter(filter, { ...filter })).toBe(true);
    expect(sameCursorFilter(filter, { schemas: ['other'] })).toBe(false);
  });

  it('rejects malformed or incomplete cursors', () => {
    expect(decodePhysicalCollectionCursor('not-json')).toBeUndefined();
    expect(
      decodePhysicalCollectionCursor(
        Buffer.from(
          JSON.stringify({
            version: 1,
            after: { schema: '', tableName: 'orders' },
            filter: {},
          }),
        ).toString('base64url'),
      ),
    ).toBeUndefined();
    expect(
      decodePhysicalCollectionCursor(
        Buffer.from(
          JSON.stringify({
            version: 1,
            after: { schema: 'main', tableName: 'orders' },
            filter: { schemas: 'main' },
          }),
        ).toString('base64url'),
      ),
    ).toBeUndefined();
  });
});

describe('BaseSchemaInspector option validation', () => {
  it('applies the default page size and accepts the maximum page size', async () => {
    const inspector = new TestSchemaInspector();

    await inspector.listPhysicalCollections();
    await inspector.listPhysicalCollections({ limit: 1000 });

    expect(inspector.calls).toEqual([{ limit: 100 }, { limit: 1000 }]);
  });

  it.each([0, -1, 1.5, 1001, Number.NaN])(
    'rejects invalid page size %s',
    async (limit) => {
      const inspector = new TestSchemaInspector();

      await expect(
        inspector.listPhysicalCollections({ limit }),
      ).rejects.toMatchObject({
        code: 'SCHEMA_INSPECTION_INVALID_OPTIONS',
        connectionName: 'test',
        dialect: 'sqlite',
      });
    },
  );

  it.each([
    null,
    [],
    { schemas: 'main' },
    { schemas: [''] },
    { tableNamePrefixes: 'app_' },
    { kinds: 'table' },
    { kinds: ['sequence'] },
  ])('rejects invalid filters: %o', async (input) => {
    const inspector = new TestSchemaInspector();

    await expect(
      inspector.listPhysicalCollections(
        input as unknown as ListPhysicalCollectionsOptions,
      ),
    ).rejects.toMatchObject({ code: 'SCHEMA_INSPECTION_INVALID_OPTIONS' });
  });

  it('rejects invalid physical identifiers', async () => {
    const inspector = new TestSchemaInspector();

    await expect(
      inspector.getPhysicalCollection({ tableName: '' }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INSPECTION_INVALID_OPTIONS' });
    await expect(
      inspector.getPhysicalCollection({ tableName: 'orders', schema: '' }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INSPECTION_INVALID_OPTIONS' });
    await expect(
      inspector.getPhysicalCollection(
        null as unknown as PhysicalCollectionIdentifier,
      ),
    ).rejects.toMatchObject({ code: 'SCHEMA_INSPECTION_INVALID_OPTIONS' });
  });

  it('rejects empty and non-string cursors', async () => {
    const inspector = new TestSchemaInspector();

    await expect(
      inspector.listPhysicalCollections({ cursor: '' }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INSPECTION_INVALID_CURSOR' });
    await expect(
      inspector.listPhysicalCollections({
        cursor: 42 as unknown as string,
      }),
    ).rejects.toMatchObject({ code: 'SCHEMA_INSPECTION_INVALID_CURSOR' });
  });
});

describe('BaseSchemaInspector error normalization', () => {
  it('retries transient SQL Server catalog deadlocks with a finite limit', async () => {
    const recovered = new DeadlockingMssqlSchemaInspector(2);
    await expect(recovered.listSchemas()).resolves.toEqual([
      { name: 'dbo', default: true },
    ]);
    expect(recovered.attempts).toBe(3);

    const exhausted = new DeadlockingMssqlSchemaInspector(4);
    await expect(exhausted.listSchemas()).rejects.toMatchObject({
      code: 'SCHEMA_INSPECTION_FAILED',
      dialect: 'mssql',
    });
    expect(exhausted.attempts).toBe(4);
  });

  it('preserves permission failures as structured errors', async () => {
    const cause = Object.assign(new Error('permission denied for schema'), {
      code: '42501',
    });
    const inspector = new FailingSchemaInspector(cause);

    await expect(inspector.listSchemas()).rejects.toMatchObject({
      code: 'SCHEMA_INSPECTION_PERMISSION_DENIED',
      connectionName: 'failing',
      dialect: 'postgres',
      cause,
    });
  });

  it('does not turn connection failures into empty results', async () => {
    const cause = new Error('connection terminated');
    const inspector = new FailingSchemaInspector(cause);

    await expect(
      inspector.getPhysicalCollection({
        schema: 'public',
        tableName: 'orders',
      }),
    ).rejects.toMatchObject({
      code: 'SCHEMA_INSPECTION_FAILED',
      schema: 'public',
      tableName: 'orders',
      cause,
    });
  });
});

describe('SchemaInspector type normalization', () => {
  it('normalizes portable types without guessing unknown native types', () => {
    expect(normalizePhysicalDataType('mysql', 'bigint unsigned')).toBe(
      'bigInt',
    );
    expect(normalizePhysicalDataType('mysql', 'tinyint(1)')).toBe('integer');
    expect(normalizePhysicalDataType('postgres', 'jsonb')).toBe('json');
    expect(normalizePhysicalDataType('postgres', 'timestamptz')).toBe(
      'datetime',
    );
    expect(
      normalizePhysicalDataType('postgres', 'time without time zone'),
    ).toBe('time');
    expect(normalizePhysicalDataType('postgres', 'inet')).toBe('native');
    expect(normalizePhysicalDataType('sqlite', '')).toBe('native');
    expect(normalizePhysicalDataType('mssql', 'bit')).toBe('boolean');
    expect(normalizePhysicalDataType('mssql', 'uniqueidentifier')).toBe('uuid');
    expect(normalizePhysicalDataType('mssql', 'datetime2(3)')).toBe('datetime');
    expect(normalizePhysicalDataType('mssql', 'rowversion')).toBe('blob');
    expect(normalizePhysicalDataType('mssql', 'nvarchar(max)')).toBe('text');
    expect(normalizePhysicalDataType('mssql', 'varchar(max)')).toBe('text');
    expect(normalizePhysicalDataType('mssql', 'nvarchar(255)')).toBe('string');
    expect(normalizePhysicalDataType('oracle', 'float(126)')).toBe('decimal');
  });

  it('preserves default expressions while parsing safe literals', () => {
    expect(parseColumnDefault("('pending'::character varying)")).toEqual({
      expression: "('pending'::character varying)",
      value: 'pending',
    });
    expect(parseColumnDefault('42')).toEqual({ expression: '42', value: 42 });
    expect(parseColumnDefault('CURRENT_TIMESTAMP')).toEqual({
      expression: 'CURRENT_TIMESTAMP',
    });
    expect(parseColumnDefault(null)).toBeUndefined();
  });

  it('normalizes referential actions from catalog representations', () => {
    expect(normalizeReferentialAction('NO ACTION')).toBe('noAction');
    expect(normalizeReferentialAction('c')).toBe('cascade');
    expect(normalizeReferentialAction('SET_NULL')).toBe('setNull');
    expect(normalizeReferentialAction('unknown')).toBeUndefined();
  });
});
