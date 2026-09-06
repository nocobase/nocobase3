import { describe, expect, it } from 'vitest';
import {
  booleanStorageValue,
  decodeBooleanValue,
  normalizeBooleanValue,
} from '../../../src/repository/boolean.js';

const field = { name: 'enabled', type: 'boolean' };

describe('Boolean value contract', () => {
  it.each([true, false, null])('accepts public value %s', (value) => {
    expect(normalizeBooleanValue(field, value)).toBe(value);
  });
  it.each([0, 1, '0', '1', 'true', 'false', 2, -1, {}, [], undefined])(
    'rejects coercible or invalid public value %j',
    (value) => {
      expect(() => normalizeBooleanValue(field, value)).toThrow(
        expect.objectContaining({ code: 'INVALID_MUTATION' }),
      );
    },
  );
  it.each([
    [0, false],
    [1, true],
    ['0', false],
    ['1', true],
    [true, true],
    [false, false],
    [null, null],
  ])('decodes exact driver value %s', (value, expected) => {
    expect(decodeBooleanValue(field, value)).toBe(expected);
  });
  it.each([2, -1, 'false', '', Buffer.from([1]), undefined])(
    'rejects corrupt storage %j',
    (value) => {
      expect(() => decodeBooleanValue(field, value)).toThrow(
        expect.objectContaining({
          code: 'INVALID_STORED_VALUE',
          path: ['select', 'enabled'],
        }),
      );
    },
  );
  it('enforces nullability and primary identity', () => {
    for (const constraint of [{ nullable: false }, { primaryKey: true }]) {
      expect(() =>
        normalizeBooleanValue({ ...field, ...constraint }, null),
      ).toThrow();
      expect(() =>
        decodeBooleanValue({ ...field, ...constraint }, null),
      ).toThrow();
    }
  });
  it.each([
    'pg',
    'postgres',
    'postgresql',
    'mssql',
    'mysql',
    'mysql2',
    'better-sqlite3',
    'oracledb',
  ])('binds %s without public input coercion', (engine) => {
    const native = ['pg', 'postgres', 'postgresql', 'mssql'].includes(engine);
    expect(booleanStorageValue(engine, field, true)).toBe(native ? true : 1);
    expect(booleanStorageValue(engine, field, false)).toBe(native ? false : 0);
    expect(booleanStorageValue(engine, field, null)).toBeNull();
    expect(() => booleanStorageValue(engine, field, 1)).toThrow();
  });
});
