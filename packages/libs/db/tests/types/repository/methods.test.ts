import { expect, expectTypeOf, it } from 'vitest';
import type { Repository, RepositoryQuery } from '../../../src/index.js';

function _validCalls(repository: Repository<{ code: string; points: number }>) {
  return {
    one: repository.findOne({
      filter: { code: 'a' },
      select: (s) => s.fields('points'),
    }),
    count: repository.count({ context: { input: {} } }),
    exists: repository.exists(),
    stream: repository.findMany({ select: (s) => s.fields('code') }),
  };
}

function invalidCalls(
  repository: Repository<{ code: string; points: number }>,
): void {
  // @ts-expect-error findOne requires a filter or a nonempty sort.
  void repository.findOne({});
  // @ts-expect-error Empty callback sort does not select a first record.
  void repository.findOne({ sort: () => [] });
  // @ts-expect-error Bulk create requires at least one record.
  void repository.createMany({ values: [] });
  // @ts-expect-error Bulk writes require a filter or explicit all-record scope.
  void repository.updateMany({ values: { points: 1 } });
  // @ts-expect-error All-record scope and a filter are mutually exclusive.
  void repository.deleteMany({ all: true, filter: { code: 'a' } });
  // @ts-expect-error count does not accept pagination.
  void repository.count({ limit: 1 });
  // @ts-expect-error Selected root fields must belong to the record type.
  void repository.findMany({ select: (s) => s.fields('missing') });
}

it('preserves method result shapes and rejects invalid method input at compile time', () => {
  type Results = ReturnType<typeof _validCalls>;
  expectTypeOf<Results['one']>().toEqualTypeOf<
    Promise<{ points: number } | undefined>
  >();
  expectTypeOf<Results['count']>().toEqualTypeOf<Promise<number>>();
  expectTypeOf<Results['exists']>().toEqualTypeOf<Promise<boolean>>();
  expectTypeOf<Results['stream']>().toEqualTypeOf<
    RepositoryQuery<{ code: string }>
  >();
  expect(invalidCalls).toBeTypeOf('function');
});
