import { describe, expect, it } from 'vitest';
import { normalizePhysicalDataType, sqliteAffinity } from '@nocobase/db';
import { sqliteTypes } from '../src/inspectors/sqlite.js';

describe('SQLite inspector type strategy', () => {
  it.each(['float', 'FLOAT(12)', ' float '])(
    'recognizes FLOAT storage %s',
    (nativeType) => {
      expect(normalizePhysicalDataType(sqliteTypes, nativeType)).toBe('float');
    },
  );

  it('keeps unknown declarations native', () => {
    expect(normalizePhysicalDataType(sqliteTypes, 'unrecognized')).toBe(
      'native',
    );
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

  it.each(['DATETIME', 'TIMESTAMP(3)', 'TEXT'] as const)(
    'classifies portable SQLite type %s',
    (nativeType) => {
      expect(normalizePhysicalDataType(sqliteTypes, nativeType)).toBe(
        nativeType === 'TEXT' ? 'text' : 'datetime',
      );
    },
  );
});
