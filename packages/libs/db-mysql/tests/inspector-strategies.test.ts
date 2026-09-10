import { describe, expect, it } from 'vitest';
import { normalizePhysicalDataType, numericCapabilities } from '@nocobase/db';
import { mysqlTypes, mysqlNumeric } from '../src/inspectors/mysql.js';

describe('MySQL inspector type strategy', () => {
  it('classifies floating, temporal, and scalar declarations', () => {
    expect(normalizePhysicalDataType(mysqlTypes, 'float')).toBe('float');
    expect(normalizePhysicalDataType(mysqlTypes, 'timestamp(6)')).toBe(
      'datetimeTz',
    );
    expect(normalizePhysicalDataType(mysqlTypes, 'datetime')).toBe('datetime');
    expect(normalizePhysicalDataType(mysqlTypes, 'time(3)')).toBe('time');
    expect(normalizePhysicalDataType(mysqlTypes, 'char(8)')).toBe('char');
    expect(normalizePhysicalDataType(mysqlTypes, 'tinyint(1)')).toBe('integer');
  });

  it('reports MySQL numeric capacity without guessing logical types', () => {
    expect(numericCapabilities(mysqlNumeric, 'int(11) unsigned')).toEqual({
      integerBits: 32,
      unsigned: true,
    });
    expect(numericCapabilities(mysqlNumeric, 'mediumint')).toEqual({
      integerBits: 24,
      unsigned: false,
    });
  });
});
