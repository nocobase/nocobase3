import { describe, expect, it } from 'vitest';
import { resourceRows } from '../client/pages/permission-sets/resource-groups.js';

const groups = [
  {
    value: 'business',
    label: 'Business',
    children: [{ value: 'sales', label: 'Sales' }],
  },
];
const items = [
  { value: 'orders', label: 'Orders', group: 'sales' },
  { value: 'home', label: 'Home' },
];

describe('resource tree rows', () => {
  it('places ungrouped items according to registration order', () => {
    const rows = resourceRows(groups, [items[1], items[0]], new Set());
    expect(rows[0]).toEqual({ kind: 'item', item: items[1], depth: 0 });
    expect(rows[1].kind).toBe('group');
  });
  it('expands nested groups by default and keeps ungrouped resources', () => {
    expect(
      resourceRows(groups, items, new Set()).map((row) => [
        row.kind,
        row.depth,
      ]),
    ).toEqual([
      ['group', 0],
      ['group', 1],
      ['item', 2],
      ['item', 0],
    ]);
  });
  it('collapses a parent without treating its hidden descendants as ungrouped', () => {
    expect(resourceRows(groups, items, new Set(['business']))).toEqual([
      { kind: 'group', group: groups[0], depth: 0 },
      { kind: 'item', item: items[1], depth: 0 },
    ]);
  });
  it('keeps the ancestor chain of filtered resources', () => {
    expect(
      resourceRows(groups, [items[0]], new Set()).map((row) => row.kind),
    ).toEqual(['group', 'group', 'item']);
  });
});
