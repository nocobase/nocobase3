import { expect, it } from 'vitest';
import {
  decodeAggregate,
  decodeCount,
} from '../../../src/numeric/aggregate.js';

it.each([
  ['0', 0],
  [0, 0],
  [null, 0],
  [undefined, 0],
  ['42', 42],
  [42n, 42],
  ['42.000', 42],
  ['4.2e1', 42],
  ['2147483648', 2147483648],
  ['9007199254740991', Number.MAX_SAFE_INTEGER],
  [9007199254740991n, Number.MAX_SAFE_INTEGER],
])('decodes count %s as a safe number', (value, expected) => {
  expect(decodeCount(value)).toBe(expected);
  expect(decodeAggregate('count', value)).toBe(expected);
});

it.each([
  '9007199254740992',
  '9007199254740993',
  9007199254740992n,
  Number.MAX_SAFE_INTEGER + 1,
  '18446744073709551615',
])('rejects unsafe count %s before converting it to number', (value) => {
  for (const decode of [
    decodeCount,
    (input: unknown) => decodeAggregate('count', input),
  ]) {
    expect(() => decode(value)).toThrowError(
      expect.objectContaining({
        code: 'INVALID_STORED_VALUE',
        message: 'COUNT exceeds the JavaScript safe integer range.',
      }),
    );
  }
});

it.each(['-1', '1.5', '9007199254740990.5'])(
  'rejects a negative or fractional count %s without rounding',
  (value) => {
    expect(() => decodeCount(value)).toThrowError(
      expect.objectContaining({
        code: 'INVALID_STORED_VALUE',
        message: 'COUNT must be a non-negative integer.',
      }),
    );
  },
);
