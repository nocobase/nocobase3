import { describe, expect, it } from 'vitest';
import {
  normalizePhysicalDataType,
  numericCapabilities,
  sqliteAffinity,
  temporalFractionalSecondsPrecision,
} from '@nocobase/db';
import { sqliteTypes } from '../src/inspectors/sqlite.js';

describe('SQLite inspector type strategy', () => {
  it.each(['float', 'FLOAT(12)', ' float '] as const)(
    'recognizes FLOAT storage %s',
    (nativeType) => {
      expect(normalizePhysicalDataType(sqliteTypes, nativeType)).toBe('float');
    },
  );

  it.each([
    ['DATETIME', 'datetime'],
    ['TIMESTAMP(3)', 'datetime'],
    ['TEXT', 'text'],
    ['unrecognized', 'native'],
  ] as const)('classifies portable type %s', (nativeType, expected) => {
    expect(normalizePhysicalDataType(sqliteTypes, nativeType)).toBe(expected);
  });

  it.each([
    ['CHAR(8)', 'text'],
    ['BOOLEAN', 'numeric'],
    ['DECIMAL(18,4)', 'numeric'],
    ['FLOATING POINT', 'integer'],
    ['STRING', 'numeric'],
    ['BLOB', 'blob'],
    ['', 'blob'],
    ['REAL', 'real'],
    ['ANY', 'numeric'],
  ] as const)('retains SQLite affinity of %s', (declaration, affinity) => {
    expect(sqliteAffinity(declaration)).toBe(affinity);
  });

  it('does not report numeric capacity for SQLite affinity types', () => {
    expect(numericCapabilities({ ignore: () => true }, 'INTEGER')).toEqual({});
  });

  it.each(['decimal(18,4)', 'varchar(64)'] as const)(
    'does not infer temporal precision from %s',
    (nativeType) => {
      expect(
        temporalFractionalSecondsPrecision(sqliteTypes, nativeType),
      ).toBeUndefined();
    },
  );

  it('keeps date as date', () => {
    expect(normalizePhysicalDataType(sqliteTypes, 'date')).toBe('date');
  });
});
