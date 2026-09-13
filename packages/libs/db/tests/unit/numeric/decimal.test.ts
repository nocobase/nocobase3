import { expect, it } from 'vitest';
import {
  decimalSortKey,
  normalizeDecimal,
} from '../../../src/numeric/decimal.js';

it.each([
  ['42.5000', '42.5'],
  ['-0.000', '0'],
  ['.3333', '0.3333'],
  ['1.23e+20', '123000000000000000000'],
  ['-1.2e-5', '-0.000012'],
  ['9007199254740993', '9007199254740993'],
  ['100.000', '100'],
])('normalizes %s without floating-point conversion', (input, expected) => {
  expect(normalizeDecimal(input)).toBe(expected);
});

it('orders decimal values numerically, including adjacent unsafe integers and negative fractions', () => {
  const ordered = [
    '-9007199254740994',
    '-9007199254740993',
    '-11',
    '-2',
    '-0.1',
    '0',
    '0.00001',
    '0.1',
    '2',
    '10',
    '9007199254740993',
    '9007199254740994',
  ];
  const actual = [...ordered].reverse().sort((a, b) => {
    const left = decimalSortKey(a)!;
    const right = decimalSortKey(b)!;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  expect(actual).toEqual(ordered);
  expect(decimalSortKey('1.0')).toBe(decimalSortKey('1'));
  expect(decimalSortKey(null)).toBeNull();
});

it.each(['NaN', 'Infinity', '1e100000', '', '.', '--2'])(
  'rejects invalid decimal %s',
  (value) => {
    expect(() => normalizeDecimal(value)).toThrow();
  },
);
