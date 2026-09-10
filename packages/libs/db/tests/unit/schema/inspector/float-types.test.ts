import { postgresTypes } from '@nocobase/db-postgres';
import { mysqlTypes } from '@nocobase/db-mysql';
import { sqliteTypes } from '@nocobase/db-sqlite';
import { oracleTypes } from '@nocobase/db-oracle';
import { mssqlTypes } from '@nocobase/db-mssql';
import { expect, it } from 'vitest';
import { normalizePhysicalDataType } from '../../../../src/schema/inspector/shared/type-normalization.js';

it.each(['float', 'FLOAT(12)', ' float '])(
  'recognizes SQLite FLOAT storage %s',
  (nativeType) => {
    expect(normalizePhysicalDataType(sqliteTypes, nativeType)).toBe('float');
  },
);

it('recognizes MySQL FLOAT and Oracle decimal FLOAT without guessing PostgreSQL aliases', () => {
  expect(normalizePhysicalDataType(mysqlTypes, 'float')).toBe('float');
  expect(normalizePhysicalDataType(oracleTypes, 'float')).toBe('decimal');
  expect(normalizePhysicalDataType(postgresTypes, 'float')).toBe('native');
});

it('preserves MSSQL FLOAT and explicit double precision classification', () => {
  expect(normalizePhysicalDataType(mssqlTypes, 'float(53)')).toBe('double');
  expect(normalizePhysicalDataType(postgresTypes, 'double precision')).toBe(
    'double',
  );
  expect(normalizePhysicalDataType(sqliteTypes, 'unrecognized')).toBe('native');
});
