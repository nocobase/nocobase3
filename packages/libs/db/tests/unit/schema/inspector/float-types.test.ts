import { expect, it } from 'vitest';
import { normalizePhysicalDataType } from '../../../../src/schema/inspector/shared/type-normalization.js';

it.each(['float', 'FLOAT(12)', ' float '])(
  'recognizes SQLite FLOAT storage %s',
  (nativeType) => {
    expect(normalizePhysicalDataType('sqlite', nativeType)).toBe('float');
  },
);

it('recognizes MySQL FLOAT while leaving unresolved aliases in other dialects unchanged', () => {
  expect(normalizePhysicalDataType('mysql', 'float')).toBe('float');
  for (const dialect of ['postgres', 'oracle'] as const) {
    expect(normalizePhysicalDataType(dialect, 'float')).toBe('native');
  }
});

it('preserves MSSQL FLOAT and explicit double precision classification', () => {
  expect(normalizePhysicalDataType('mssql', 'float(53)')).toBe('double');
  expect(normalizePhysicalDataType('postgres', 'double precision')).toBe(
    'double',
  );
  expect(normalizePhysicalDataType('sqlite', 'unrecognized')).toBe('native');
});
