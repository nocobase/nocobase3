import knex from 'knex';
import { describe, expect, it } from 'vitest';
import kingbasePostgres from '../src/index.js';

function createRuntime() {
  const client = knex({ client: 'pg' });
  const runtime = kingbasePostgres.driver.createRuntime!({
    dialect: 'kingbase-postgres',
    sourceConfig: {} as never,
    config: {} as never,
    capabilities: kingbasePostgres.driver.capabilities as never,
    getClient: () => client,
    resolveClient: async () => client,
  });
  return { client, runtime };
}

describe('kingbasePostgres runtime strategy', () => {
  it('exposes KingbaseES PostgreSQL capabilities and native temporal SQL', () => {
    const { client, runtime } = createRuntime();
    expect(runtime.capabilities.schemas).toBe(true);
    expect(runtime.capabilities.materializedViews).toBe(true);
    expect(
      runtime.schema!.columnType!({
        column: { type: 'datetimeTz' } as never,
        tablePrimaryKey: false,
      }),
    ).toBe('timestamp(3) with time zone');

    const repository = runtime.repository!;
    expect(
      repository.temporalBinding!({
        client,
        field: { type: 'datetimeTz' } as never,
        value: '2026-09-06T12:30:00.000Z',
      }),
    ).toBe('2026-09-06T12:30:00.000Z');
    const projection = repository.temporalProjection!({
      client,
      field: { type: 'datetimeTz' } as never,
      reference: 'occurred_at',
    });
    expect(projection.toQuery()).toContain("at time zone 'UTC'");
    expect(projection.toQuery()).toContain("|| 'Z'");
  });

  it('compiles JSON path filters with bound values and immutable paths', () => {
    const { client, runtime } = createRuntime();
    const compile = runtime.repository!.compileJsonCondition!;
    const node = {
      operator: '$jsonEq',
      jsonPath: ['profile', 'name'],
      value: "O'Reilly",
    } as never;
    const sql = compile({ client, column: 'payload', node }).toSQL();
    expect(sql.sql).toContain('#>');
    expect(sql.sql).not.toContain("O'Reilly");
    expect(sql.bindings).toHaveLength(2);
    expect(sql.bindings.join('|')).toContain("O'Reilly");
  });

  it('owns KingbaseES PostgreSQL defaults and schema-scoped ownership identity', () => {
    expect(
      kingbasePostgres.driver.normalizeConnection?.(
        { dialect: 'kingbase-postgres', database: 'app' } as never,
        {},
      ),
    ).toMatchObject({
      host: '127.0.0.1',
      port: 54321,
      database: 'app',
      username: 'nocobase',
      schema: ['public'],
    });
    expect(
      kingbasePostgres.driver.resolveOwnershipTarget?.({
        dialect: 'kingbase-postgres',
        host: 'db.example.test',
        port: 54321,
        database: 'app',
        schema: ['tenant_a', 'public'],
      }),
    ).toEqual([
      'kingbase-postgres',
      'db.example.test',
      54321,
      undefined,
      'app',
      'tenant_a',
    ]);
  });
});
