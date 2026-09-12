import { expectTypeOf, it } from 'vitest';
import type {
  FilterBuilder,
  FilterNode,
  RepositoryFilter,
} from '../../../src/index.js';

interface Row {
  code: string;
  amount: number;
  enabled: boolean | null;
}

function _acceptsFilter(f: FilterBuilder<Row>): FilterNode {
  f.string('code').eq(f.variable('$code'));
  f.number('amount').gte(f.variable('$minimum'));
  f.date('createdAt').between([new Date(), f.variable('$end')]);
  f.json('payload').hasEvery([1, true, null, '1']);
  // @ts-expect-error Numeric comparisons do not accept string literals.
  f.number('amount').gt('1');
  // @ts-expect-error Text patterns require textual operands.
  f.string('code').includes(1);
  // @ts-expect-error Only supported comparison modes are accepted.
  f.string('code').eq('x', { mode: 'unknown' });
  // @ts-expect-error Membership arrays contain scalars, not objects.
  f.json('payload').hasSome([{}]);
  // @ts-expect-error Date ranges require exactly two endpoints.
  f.date('createdAt').between(['2026-01-01']);
  // @ts-expect-error Relation callbacks must return a Filter node.
  f.relation('tasks').some(() => undefined);
  return f.and([f.boolean('enabled').isFalse(), f.string('code').notEmpty()]);
}

function _shorthandContracts(): RepositoryFilter<Row> {
  const valid: RepositoryFilter<Row> = { code: 'A', amount: 0, enabled: null };
  // @ts-expect-error Shorthand field names belong to the record.
  const missing: RepositoryFilter<Row> = { missing: 'A' };
  void missing;
  return valid;
}

it('checks public Filter expression and shorthand constraints', () => {
  expectTypeOf<ReturnType<typeof _acceptsFilter>>().toEqualTypeOf<FilterNode>();
  expectTypeOf<ReturnType<typeof _shorthandContracts>>().toEqualTypeOf<
    RepositoryFilter<Row>
  >();
});
