import { describe, expect, it } from 'vitest';
import { normalizePhysicalDataType, numericCapabilities } from '@nocobase/db';
import { mssqlTypes, mssqlNumeric } from '../src/inspectors/mssql.js';

describe('SQL Server inspector type strategy', () => {
  it('classifies SQL Server temporal, scalar, and floating declarations', () => {
    expect(normalizePhysicalDataType(mssqlTypes, 'datetimeoffset(7)')).toBe(
      'datetimeTz',
    );
    expect(normalizePhysicalDataType(mssqlTypes, 'datetime2(3)')).toBe(
      'datetime',
    );
    expect(normalizePhysicalDataType(mssqlTypes, 'smalldatetime')).toBe(
      'datetime',
    );
    expect(normalizePhysicalDataType(mssqlTypes, 'timestamp')).toBe('blob');
    expect(normalizePhysicalDataType(mssqlTypes, 'nchar(8)')).toBe('char');
    expect(normalizePhysicalDataType(mssqlTypes, 'nvarchar(max)')).toBe('text');
    expect(normalizePhysicalDataType(mssqlTypes, 'bit')).toBe('boolean');
    expect(normalizePhysicalDataType(mssqlTypes, 'float(24)')).toBe('float');
    expect(normalizePhysicalDataType(mssqlTypes, 'float(25)')).toBe('double');
  });

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
});
