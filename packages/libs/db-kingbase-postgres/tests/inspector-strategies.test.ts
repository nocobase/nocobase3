import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalDataType,
  numericCapabilities,
  temporalFractionalSecondsPrecision,
} from '@nocobase/db';
import {
  kingbasePostgresTypes,
  kingbasePostgresNumeric,
} from '../src/inspectors/kingbase-postgres.js';

describe('KingbaseES PostgreSQL inspector type strategy', () => {
  it.each([
    ['float', 'native'],
    ['double precision', 'double'],
    ['jsonb', 'json'],
    ['inet', 'native'],
    ['bpchar', 'char'],
    ['character(8)', 'char'],
    ['char', 'native'],
    ['"char"', 'native'],
    ['varchar(8)', 'string'],
    ['citext', 'text'],
    ['bit(1)', 'native'],
    ['varchar_custom', 'native'],
  ] as const)('classifies %s as %s', (nativeType, expected) => {
    expect(normalizePhysicalDataType(kingbasePostgresTypes, nativeType)).toBe(
      expected,
    );
  });

  it.each([
    ['timestamp(3) with time zone', 'datetimeTz', 3],
    ['timestamp without time zone', 'datetime', 6],
    ['timestamptz', 'datetimeTz', 6],
    ['time(4) with time zone', 'native', 4],
    ['timetz', 'native', 6],
    ['time(0) without time zone', 'time', 0],
    ['interval', 'native', undefined],
    ['timestamp_custom', 'native', undefined],
  ] as const)(
    'classifies temporal declaration %s',
    (nativeType, expected, precision) => {
      expect(normalizePhysicalDataType(kingbasePostgresTypes, nativeType)).toBe(
        expected,
      );
      expect(
        temporalFractionalSecondsPrecision(kingbasePostgresTypes, nativeType),
      ).toBe(precision);
    },
  );

  it('reports integer capacity', () => {
    expect(numericCapabilities(kingbasePostgresNumeric, 'int2')).toEqual({
      integerBits: 16,
      unsigned: false,
    });
  });

  it.each(['decimal(18,4)', 'varchar(64)'] as const)(
    'does not infer temporal precision from %s',
    (nativeType) => {
      expect(
        temporalFractionalSecondsPrecision(kingbasePostgresTypes, nativeType),
      ).toBeUndefined();
    },
  );

  it('keeps date as date', () => {
    expect(normalizePhysicalDataType(kingbasePostgresTypes, 'date')).toBe(
      'date',
    );
  });
});
