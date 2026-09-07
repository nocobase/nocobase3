import knex from 'knex';
import { describe, expect, it } from 'vitest';
import {
  temporalBinding,
  temporalProjection,
} from '../../../src/repository/internal/temporal-sql.js';

describe('native temporal SQL boundaries', () => {
  it('rejects legacy SQL Server range and precision loss', () => {
    const client = knex({ client: 'mssql' });
    const field = {
      name: 'occurredAt',
      type: 'datetime',
      db: { nativeType: 'datetime' },
    };
    for (const value of [
      '1752-12-31T23:59:59.000',
      '2026-09-06T12:30:00.001',
      '9999-12-31T23:59:59.999',
    ]) {
      expect(() => temporalBinding(client, field, value)).toThrow(
        expect.objectContaining({ code: 'INVALID_MUTATION' }),
      );
    }
    expect(
      temporalBinding(client, field, '2026-09-06T12:30:00.003'),
    ).toHaveProperty('bindings', ['2026-09-06T12:30:00.003']);

    const minuteField = { ...field, db: { nativeType: 'smalldatetime' } };
    for (const value of [
      '1899-12-31T23:59:00.000',
      '2026-09-06T12:30:01.000',
      '2079-06-07T00:00:00.000',
    ]) {
      expect(() => temporalBinding(client, minuteField, value)).toThrow(
        expect.objectContaining({ code: 'INVALID_MUTATION' }),
      );
    }
    expect(
      temporalBinding(client, minuteField, '2026-09-06T12:30:00.000'),
    ).toHaveProperty('bindings', ['2026-09-06T12:30:00.000']);
  });

  it('rejects precision loss before SQL is executed', () => {
    const client = knex({ client: 'oracledb' });
    const field = {
      name: 'occurredAt',
      type: 'datetimeTz',
      fractionalSecondsPrecision: 6,
    };
    expect(() => temporalProjection(client, field, field.name)).toThrow(
      expect.objectContaining({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' }),
    );
    expect(() =>
      temporalBinding(client, field, '2026-09-06T12:30:00Z'),
    ).toThrow(
      expect.objectContaining({ code: 'FIELD_CAPABILITY_NOT_SUPPORTED' }),
    );
    expect(() =>
      temporalBinding(
        client,
        { ...field, fractionalSecondsPrecision: 0 },
        '2026-09-06T12:30:00.001Z',
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_MUTATION' }));
  });

  it('preserves Oracle null instants before appending the UTC suffix', () => {
    const client = knex({ client: 'oracledb' });
    const expression = temporalProjection(
      client,
      { name: 'occurredAt', type: 'datetimeTz' },
      'occurredAt',
    );
    expect(expression.toQuery()).toContain('case when');
    expect(expression.toQuery()).toContain('is null then null');
    expect(expression.toQuery()).toContain('sys_extract_utc');
  });
});
