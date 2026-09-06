import { describe, expect, it } from 'vitest';
import {
  numericCapabilities,
  sqliteAffinity,
} from '../../../../src/schema/inspector/shared/column-capabilities.js';
import { normalizePhysicalDataType } from '../../../../src/schema/inspector/shared/type-normalization.js';

describe('Physical scalar capabilities', () => {
  it.each([
    ['postgres', 'bpchar', 'char'],
    ['postgres', 'character(8)', 'char'],
    ['postgres', 'char', 'native'],
    ['postgres', '"char"', 'native'],
    ['postgres', 'varchar(8)', 'string'],
    ['postgres', 'citext', 'text'],
    ['mysql', 'char(8)', 'char'],
    ['mysql', 'tinyint(1)', 'integer'],
    ['mysql', 'bit(1)', 'native'],
    ['postgres', 'bit(1)', 'native'],
    ['oracle', 'NCHAR(8)', 'char'],
    ['oracle', 'NUMBER(1,0)', 'decimal'],
    ['oracle', 'BOOLEAN', 'boolean'],
    ['oracle', 'LONG RAW', 'blob'],
    ['mssql', 'nchar(8)', 'char'],
    ['mssql', 'nvarchar(max)', 'text'],
    ['mssql', 'bit', 'boolean'],
    ['mssql', 'float(24)', 'float'],
    ['mssql', 'float(25)', 'double'],
    ['sqlite', 'CHAR(8)', 'char'],
    ['sqlite', 'BOOLEAN', 'boolean'],
    ['postgres', 'varchar_custom', 'native'],
  ] as const)('%s %s is %s', (dialect, nativeType, expected) => {
    expect(normalizePhysicalDataType(dialect, nativeType)).toBe(expected);
  });
  it.each([
    ['postgres', 'int2', { integerBits: 16, unsigned: false }],
    ['mysql', 'int(11) unsigned', { integerBits: 32, unsigned: true }],
    ['mysql', 'mediumint', { integerBits: 24, unsigned: false }],
    ['mssql', 'tinyint', { integerBits: 8, unsigned: true }],
    ['mssql', 'float(24)', { binaryPrecision: 24 }],
    ['mssql', 'float(25)', { binaryPrecision: 53 }],
    ['oracle', 'FLOAT(126)', { binaryPrecision: 126 }],
    ['oracle', 'BINARY_FLOAT', { binaryPrecision: 24 }],
    ['oracle', 'NUMBER(10,0)', {}],
    ['sqlite', 'INTEGER', {}],
  ] as const)(
    'reports %s %s capacity without guessing logical types',
    (dialect, nativeType, expected) => {
      expect(numericCapabilities(dialect, nativeType)).toEqual(expected);
    },
  );
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
});
