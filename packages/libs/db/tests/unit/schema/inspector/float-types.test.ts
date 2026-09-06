import { expect, it } from 'vitest';
import { normalizePhysicalDataType } from '../../../../src/schema/inspector/shared/type-normalization.js';

it.each(['float', 'FLOAT(12)', ' float '])(
  'recognizes SQLite FLOAT storage %s',
  (nativeType) => {
    expect(normalizePhysicalDataType('sqlite', nativeType)).toBe('float');
  },
);

it('does not infer precision-dependent FLOAT aliases for other dialects', () => {
  for (const dialect of ['mysql', 'postgres', 'oracle'] as const) {
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
