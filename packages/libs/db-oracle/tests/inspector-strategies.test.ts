import { describe, expect, it } from 'vitest';
import { normalizePhysicalDataType, numericCapabilities } from '@nocobase/db';
import { oracleTypes, oracleNumeric } from '../src/inspectors/oracle.js';

describe('Oracle inspector type strategy', () => {
  it('classifies Oracle temporal and scalar declarations', () => {
    expect(normalizePhysicalDataType(oracleTypes, 'DATE')).toBe('datetime');
    expect(
      normalizePhysicalDataType(oracleTypes, 'TIMESTAMP(9) WITH TIME ZONE'),
    ).toBe('datetimeTz');
    expect(normalizePhysicalDataType(oracleTypes, 'TIMESTAMP')).toBe(
      'datetime',
    );
    expect(normalizePhysicalDataType(oracleTypes, 'float')).toBe('decimal');
    expect(normalizePhysicalDataType(oracleTypes, 'NCHAR(8)')).toBe('char');
    expect(normalizePhysicalDataType(oracleTypes, 'NUMBER(1,0)')).toBe(
      'decimal',
    );
    expect(normalizePhysicalDataType(oracleTypes, 'BOOLEAN')).toBe('boolean');
    expect(normalizePhysicalDataType(oracleTypes, 'LONG RAW')).toBe('blob');
  });

  it('reports Oracle numeric capacity', () => {
    expect(numericCapabilities(oracleNumeric, 'FLOAT(126)')).toEqual({
      binaryPrecision: 126,
    });
    expect(numericCapabilities(oracleNumeric, 'BINARY_FLOAT')).toEqual({
      binaryPrecision: 24,
    });
    expect(numericCapabilities(oracleNumeric, 'NUMBER(10,0)')).toEqual({});
  });
});
