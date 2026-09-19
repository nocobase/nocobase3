import { expect, it } from 'vitest';
import { compareResourceNames } from '../client/resource-name-order.js';

it('sorts resource names alphabetically regardless of case', () => {
  const names = ['zebra', 'Beta', 'alpha', 'Alpha', 'beta'];
  expect([...names].sort(compareResourceNames)).toEqual([
    'Alpha',
    'alpha',
    'Beta',
    'beta',
    'zebra',
  ]);
  expect(compareResourceNames('same', 'same')).toBe(0);
  expect(names[0]).toBe('zebra');
});
