import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalDataType,
  numericCapabilities,
  temporalFractionalSecondsPrecision,
} from '@nocobase/db';
import { mssqlTypes, mssqlNumeric } from '../src/inspectors/mssql.js';

describe('SQL Server inspector type strategy', () => {
  it.each([
    ['datetimeoffset(7)', 'datetimeTz', 7],
    ['datetime2(3)', 'datetime', 3],
    ['datetime', 'datetime', undefined],
    ['smalldatetime', 'datetime', 0],
    ['timestamp', 'blob', undefined],
  ] as const)(
    'classifies temporal declaration %s',
    (nativeType, expected, precision) => {
      expect(normalizePhysicalDataType(mssqlTypes, nativeType)).toBe(expected);
      expect(temporalFractionalSecondsPrecision(mssqlTypes, nativeType)).toBe(
        precision,
      );
    },
  );

  it.each([
    ['nchar(8)', 'char'],
    ['nvarchar(max)', 'text'],
    ['varchar(max)', 'text'],
    ['nvarchar(255)', 'string'],
    ['bit', 'boolean'],
    ['uniqueidentifier', 'uuid'],
    ['rowversion', 'blob'],
    ['float(24)', 'float'],
    ['float(25)', 'double'],
  ] as const)(
    'classifies scalar declaration %s as %s',
    (nativeType, expected) => {
      expect(normalizePhysicalDataType(mssqlTypes, nativeType)).toBe(expected);
    },
  );

  it('reports SQL Server numeric capacity', () => {
    expect(numericCapabilities(mssqlNumeric, 'tinyint')).toEqual({
      integerBits: 8,
      unsigned: true,
    });
    expect(numericCapabilities(mssqlNumeric, 'float(24)')).toEqual({
      binaryPrecision: 24,
    });
    expect(numericCapabilities(mssqlNumeric, 'float(25)')).toEqual({
      binaryPrecision: 53,
    });
  });

  it.each(['decimal(18,4)', 'varchar(64)'] as const)(
    'does not infer temporal precision from %s',
    (nativeType) => {
      expect(
        temporalFractionalSecondsPrecision(mssqlTypes, nativeType),
      ).toBeUndefined();
    },
  );

  it('keeps date as date', () => {
    expect(normalizePhysicalDataType(mssqlTypes, 'date')).toBe('date');
  });
});
