import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalDataType,
  numericCapabilities,
  temporalFractionalSecondsPrecision,
} from '@nocobase/db';
import { oracleTypes, oracleNumeric } from '../src/inspectors/oracle.js';

describe('Oracle inspector type strategy', () => {
  it.each([
    ['DATE', 'datetime', 0],
    ['TIMESTAMP(9) WITH TIME ZONE', 'datetimeTz', 9],
    ['TIMESTAMP(6) WITH LOCAL TIME ZONE', 'datetimeTz', 6],
    ['TIMESTAMP', 'datetime', 6],
    ['INTERVAL DAY(2) TO SECOND(6)', 'native', undefined],
  ] as const)(
    'classifies temporal declaration %s',
    (nativeType, expected, precision) => {
      expect(normalizePhysicalDataType(oracleTypes, nativeType)).toBe(expected);
      expect(temporalFractionalSecondsPrecision(oracleTypes, nativeType)).toBe(
        precision,
      );
    },
  );

  it.each([
    ['float', 'decimal'],
    ['NCHAR(8)', 'char'],
    ['NUMBER(1,0)', 'decimal'],
    ['BOOLEAN', 'boolean'],
    ['LONG RAW', 'blob'],
  ] as const)(
    'classifies scalar declaration %s as %s',
    (nativeType, expected) => {
      expect(normalizePhysicalDataType(oracleTypes, nativeType)).toBe(expected);
    },
  );

  it('reports Oracle numeric capacity', () => {
    expect(numericCapabilities(oracleNumeric, 'FLOAT(126)')).toEqual({
      binaryPrecision: 126,
    });
    expect(numericCapabilities(oracleNumeric, 'BINARY_FLOAT')).toEqual({
      binaryPrecision: 24,
    });
    expect(numericCapabilities(oracleNumeric, 'NUMBER(10,0)')).toEqual({});
  });

  it.each(['decimal(18,4)', 'varchar(64)'] as const)(
    'does not infer temporal precision from %s',
    (nativeType) => {
      expect(
        temporalFractionalSecondsPrecision(oracleTypes, nativeType),
      ).toBeUndefined();
    },
  );
});
