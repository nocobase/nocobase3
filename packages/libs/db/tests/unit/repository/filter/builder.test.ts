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

  it('copies field paths and serializes time predicates without leaking builder metadata', () => {
    const filter = new DefaultFilterBuilder();
    const path = ['owner', 'schedule'];
    const time = filter.time(path);
    path.push('changed');
    expect(time.eq('12:30:00')).toEqual({
      kind: 'condition',
      path: ['owner', 'schedule'],
      operator: '$eq',
      value: '12:30:00',
    });
    expect(time.ne(null)).toEqual({
      kind: 'condition',
      path: ['owner', 'schedule'],
      operator: '$ne',
      value: null,
    });
    expect(filter.time('schedule').empty()).toEqual({
      kind: 'condition',
      path: ['schedule'],
      operator: '$empty',
    });
    const node = filter.string('name').eq('ALPHA', { mode: 'insensitive' });
    expect(JSON.parse(JSON.stringify(node))).toEqual({
      kind: 'condition',
      path: ['name'],
      operator: '$eq',
      value: 'ALPHA',
      mode: 'insensitive',
    });
  });

  it('normalizes datetime range endpoints and preserves variable operands', () => {
    const filter = new DefaultFilterBuilder();
    const start = new Date('2026-09-01T00:00:00Z');
    const node = filter
      .date('occurredAt')
      .between([start, filter.variable('$window.end')]);
    start.setUTCFullYear(2030);
    expect(node).toEqual({
      kind: 'condition',
      path: ['occurredAt'],
      operator: '$dateBetween',
      value: [
        '2026-09-01T00:00:00.000Z',
        { kind: 'variable', path: '$window.end' },
      ],
    });
  });
});
