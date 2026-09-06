import { expect, it } from 'vitest';
import { normalizePhysicalDataType } from '../../../../src/schema/inspector/shared/type-normalization.js';

it.each(['sqlite', 'mysql', 'postgres', 'oracle'] as const)(
  'recognizes FLOAT storage for %s',
  (dialect) => {
    expect(normalizePhysicalDataType(dialect, 'float')).toBe('float');
    expect(normalizePhysicalDataType(dialect, 'FLOAT(12)')).toBe('float');
  },
);

it('preserves MSSQL FLOAT and explicit double precision classification', () => {
  expect(normalizePhysicalDataType('mssql', 'float(53)')).toBe('double');
  expect(normalizePhysicalDataType('postgres', 'double precision')).toBe(
    'double',
  );
  expect(normalizePhysicalDataType('sqlite', 'unrecognized')).toBe('native');
});
