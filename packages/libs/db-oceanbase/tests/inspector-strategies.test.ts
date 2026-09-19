import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalDataType,
  numericCapabilities,
  temporalFractionalSecondsPrecision,
} from '@nocobase/db';
import { mysqlTypes, mysqlNumeric } from '../src/inspectors/mysql.js';

describe('MySQL inspector type strategy', () => {
  it.each([
    ['float', 'float'],
    ['char(8)', 'char'],
    ['tinyint(1)', 'integer'],
    ['bigint unsigned', 'bigInt'],
    ['year', 'native'],
  ] as const)('classifies %s as %s', (nativeType, expected) => {
    expect(normalizePhysicalDataType(mysqlTypes, nativeType)).toBe(expected);
  });

  it.each([
    ['timestamp(6)', 'datetimeTz', 6],
    ['datetime', 'datetime', 0],
    ['time(3)', 'time', 3],
  ] as const)(
    'classifies temporal declaration %s',
    (nativeType, expected, precision) => {
      expect(normalizePhysicalDataType(mysqlTypes, nativeType)).toBe(expected);
      expect(temporalFractionalSecondsPrecision(mysqlTypes, nativeType)).toBe(
        precision,
      );
    },
  );

  it('reports integer capacity and unsignedness', () => {
    expect(numericCapabilities(mysqlNumeric, 'int(11) unsigned')).toEqual({
      integerBits: 32,
      unsigned: true,
    });
    expect(numericCapabilities(mysqlNumeric, 'mediumint')).toEqual({
      integerBits: 24,
      unsigned: false,
    });
  });

  it.each(['decimal(18,4)', 'varchar(64)'] as const)(
    'does not infer temporal precision from %s',
    (nativeType) => {
      expect(
        temporalFractionalSecondsPrecision(mysqlTypes, nativeType),
      ).toBeUndefined();
    },
  );

  it('keeps date as date', () => {
    expect(normalizePhysicalDataType(mysqlTypes, 'date')).toBe('date');
  });
});
