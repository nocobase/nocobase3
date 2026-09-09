import { expect, it } from 'vitest';
import {
  DefaultSortBuilder,
  sortExpressionToNode,
} from '../../../../src/repository/sort-builder.js';

it('copies input paths and keeps null-position branches independent', () => {
  const path = ['owner', 'name'];
  const sort = new DefaultSortBuilder();
  const base = sort.field(path).asc();
  const first = base.nullsFirst();
  const last = base.nullsLast();
  path.push('unexpected');
  expect(sortExpressionToNode(base)).toEqual({
    kind: 'field',
    path: ['owner', 'name'],
    direction: 'asc',
  });
  expect(sortExpressionToNode(first)).toEqual({
    kind: 'field',
    path: ['owner', 'name'],
    direction: 'asc',
    nulls: 'first',
  });
  expect(sortExpressionToNode(last)).toEqual({
    kind: 'field',
    path: ['owner', 'name'],
    direction: 'asc',
    nulls: 'last',
  });
  expect(sortExpressionToNode(sort.field('owner.name').asc())).toEqual(
    sortExpressionToNode(base),
  );
});

it.each(['sum', 'avg', 'min', 'max'] as const)(
  'builds serializable %s relation nodes',
  (aggregate) => {
    const sort = new DefaultSortBuilder();
    const expression = sort
      .relation(['tasks'])
      [aggregate]('points')
      .desc()
      .nullsLast();
    const node = sortExpressionToNode(expression);
    expect(node).toEqual({
      kind: 'aggregate',
      relation: ['tasks'],
      aggregate,
      field: 'points',
      direction: 'desc',
      nulls: 'last',
    });
    expect(JSON.parse(JSON.stringify(node))).toEqual(node);
  },
);

it('omits the field for count and rejects objects masquerading as expressions', () => {
  const sort = new DefaultSortBuilder();
  expect(sortExpressionToNode(sort.relation('tasks').count().asc())).toEqual({
    kind: 'aggregate',
    relation: ['tasks'],
    aggregate: 'count',
    direction: 'asc',
  });
  expect(() =>
    sortExpressionToNode({
      kind: 'sortExpression',
      toNode: () => ({}),
    } as never),
  ).toThrow(TypeError);
});
