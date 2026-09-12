import { expect, it } from 'vitest';
import {
  DefaultAggregateBuilder,
  aggregateExpressionToNode,
} from '../../../../src/repository/aggregate-builder.js';

it.each(['sum', 'avg', 'min', 'max'] as const)(
  'reuses %s expressions with independent aliases',
  (kind) => {
    const expression = new DefaultAggregateBuilder()[kind]('points');
    expect(aggregateExpressionToNode('first', expression)).toEqual({
      kind,
      field: 'points',
      alias: 'first',
    });
    expect(aggregateExpressionToNode('second', expression)).toEqual({
      kind,
      field: 'points',
      alias: 'second',
    });
  },
);

it('distinguishes row count from field count and rejects forged expressions', () => {
  const builder = new DefaultAggregateBuilder();
  expect(aggregateExpressionToNode('rows', builder.count())).toEqual({
    kind: 'count',
    alias: 'rows',
    field: undefined,
  });
  expect(
    aggregateExpressionToNode('populated', builder.count('points')),
  ).toEqual({ kind: 'count', alias: 'populated', field: 'points' });
  expect(() =>
    aggregateExpressionToNode('bad', {
      kind: 'aggregateExpression',
      toNode: () => ({}),
    } as never),
  ).toThrow(TypeError);
});
