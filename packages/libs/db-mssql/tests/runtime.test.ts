import knex from 'knex';
import { describe, expect, it, vi } from 'vitest';
import mssql from '../src/index.js';

function createRuntime() {
  const client = knex({ client: 'mssql' });
  const runtime = mssql.driver.createRuntime!({
    dialect: 'mssql',
    sourceConfig: {} as never,
    config: {} as never,
    capabilities: mssql.driver.capabilities as never,
    getClient: () => client,
    resolveClient: async () => client,
  });
  return { client, runtime };
}

describe('mssql runtime strategy', () => {
  it('compiles SQL Server aggregate, schema and predicate behavior', () => {
    const { client, runtime } = createRuntime();
    const aggregate = runtime.numeric!.aggregateSql!({
      client,
      kind: 'count',
      field: '*',
      distinct: false,
    });
    expect(aggregate.toQuery()).toContain('count_big');
    expect(
      runtime.schema!.columnType!({
        column: { type: 'datetimeTz' } as never,
        tablePrimaryKey: false,
      }),
    ).toBe('datetimeoffset(3)');
    expect(
      runtime.schema!.columnType!({
        column: { type: 'enum', length: 32 } as never,
        tablePrimaryKey: false,
      }),
    ).toBe('nvarchar(32)');

    const foreign = { onDelete: vi.fn(), onUpdate: vi.fn() };
    runtime.schema!.configureForeignKey!({
      foreign,
      constraint: {
        type: 'foreignKey',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      } as never,
    });
    expect(foreign.onDelete).toHaveBeenCalledWith('NO ACTION');
    expect(foreign.onUpdate).toHaveBeenCalledWith('CASCADE');

    const predicate = runtime.schema!.buildPredicate!({
      client,
      predicate: {
        status: { $eq: 'active' },
        count: { $gte: 2 },
      } as never,
    });
    expect(predicate?.toQuery()).toContain('where');
    expect(predicate?.toQuery()).toContain('active');
  });

  it('owns SQL Server value codecs, numeric precision and temporal range checks', () => {
    const { client, runtime } = createRuntime();
    const repository = runtime.repository!;
    expect(repository.encodeBoolean!({} as never, true)).toBe(true);
    const blobNull = repository.encodeBlobNull!(client);
    expect(blobNull?.toQuery()).toContain('varbinary(max)');
    expect(repository.escapeLikePattern!('100%_[done')).toBe(
      '100\\%\\_\\[done',
    );

    const mutation = repository.numericMutation!({
      client,
      field: { type: 'decimal' } as never,
      name: 'amount',
      operation: 'increment',
      operand: '1.25',
    });
    expect(mutation?.toQuery()).toContain('decimal(3, 2)');
    expect(() =>
      repository.numericMutation!({
        client,
        field: { type: 'decimal' } as never,
        name: 'amount',
        operation: 'increment',
        operand: '1'.repeat(40),
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MUTATION' }));

    const datetime = { type: 'datetime', db: { nativeType: 'datetime' } };
    expect(() =>
      repository.temporalBinding!({
        client,
        field: datetime as never,
        value: '1752-12-31T23:59:59.000',
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MUTATION' }));
    const projection = repository.temporalProjection!({
      client,
      field: { type: 'datetimeTz' } as never,
      reference: 'occurred_at',
    });
    expect(projection.toQuery()).toContain('switchoffset');
  });

  it('owns SQL Server connection defaults and database identity', () => {
    expect(
      mssql.driver.normalizeConnection?.(
        { dialect: 'mssql', database: 'app' } as never,
        {},
      ),
    ).toMatchObject({
      host: '127.0.0.1',
      port: 1433,
      database: 'app',
      username: 'sa',
      encrypt: false,
      trustServerCertificate: false,
    });
    expect(
      mssql.driver.resolveOwnershipTarget?.({
        dialect: 'mssql',
        host: 'db.example.test',
        port: 1433,
        database: 'app',
      }),
    ).toEqual(['mssql', 'db.example.test', 1433, undefined, 'app', 'dbo']);
  });
});
