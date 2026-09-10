import { describe, expect, it } from 'vitest';
import { normalizePhysicalDataType, numericCapabilities } from '@nocobase/db';
import { postgresTypes, postgresNumeric } from '../src/inspectors/postgres.js';

describe('PostgreSQL inspector type strategy', () => {
  it('classifies floating and temporal declarations', () => {
    expect(normalizePhysicalDataType(postgresTypes, 'float')).toBe('native');
    expect(normalizePhysicalDataType(postgresTypes, 'double precision')).toBe(
      'double',
    );
    expect(normalizePhysicalDataType(postgresTypes, 'timestamptz')).toBe(
      'datetimeTz',
    );
    expect(
      normalizePhysicalDataType(postgresTypes, 'time without time zone'),
    ).toBe('time');
    expect(normalizePhysicalDataType(postgresTypes, 'jsonb')).toBe('json');
    expect(normalizePhysicalDataType(postgresTypes, 'inet')).toBe('native');
  });

  it('classifies PostgreSQL scalar declarations and numeric capacity', () => {
    expect(normalizePhysicalDataType(postgresTypes, 'bpchar')).toBe('char');
    expect(normalizePhysicalDataType(postgresTypes, 'character(8)')).toBe(
      'char',
    );
    expect(normalizePhysicalDataType(postgresTypes, 'varchar(8)')).toBe(
      'string',
    );
    expect(normalizePhysicalDataType(postgresTypes, 'citext')).toBe('text');
    expect(normalizePhysicalDataType(postgresTypes, 'bit(1)')).toBe('native');
    expect(numericCapabilities(postgresNumeric, 'int2')).toEqual({
      integerBits: 16,
      unsigned: false,
    });
  });
});
