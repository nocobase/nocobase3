import { describe, expect, it } from 'vitest';
import { DefaultFilterBuilder } from '../../../../src/repository/filter-builder.js';

describe('DefaultFilterBuilder', () => {
  it('builds canonical serializable scalar nodes', () => {
    const filter = new DefaultFilterBuilder();
    const node = filter.and([
      filter.string('status').eq('paid'),
      filter.number(['amount']).gte(100),
      filter.date('createdAt').before(new Date('2026-09-04T00:00:00Z')),
    ]);

    expect(node).toEqual({
      kind: 'group',
      logic: 'and',
      items: [
        { kind: 'condition', path: ['status'], operator: '$eq', value: 'paid' },
        { kind: 'condition', path: ['amount'], operator: '$gte', value: 100 },
        {
          kind: 'condition',
          path: ['createdAt'],
          operator: '$dateBefore',
          value: '2026-09-04T00:00:00.000Z',
        },
      ],
    });
    expect(JSON.parse(JSON.stringify(node))).toEqual(node);
  });
});
