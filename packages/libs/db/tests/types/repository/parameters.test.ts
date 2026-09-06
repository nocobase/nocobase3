import { expect, expectTypeOf, it } from 'vitest';
import type {
  Repository,
  CreateManyResult,
  UpdateManyResult,
  DeleteOneResult,
  DeleteManyResult,
  SingleMutationResult,
} from '../../../src/index.js';

type Entry = { code: string; points: number; status: string };

function _results(repository: Repository<Entry>) {
  return {
    create: repository.createMany({
      values: [{ code: 'A', points: 1, status: 'draft' }],
      select: (s) => s.fields('code'),
    }),
    update: repository.updateMany({
      all: true,
      values: { points: 2 },
      select: (s) => s.fields('points'),
    }),
    deleteOne: repository.deleteOne({
      filter: { code: 'A' },
      select: (s) => s.fields('status'),
    }),
    deleteMany: repository.deleteMany({ all: true }),
    upsert: repository.upsertOne({
      filter: { code: 'A' },
      create: { code: 'A', points: 1, status: 'draft' },
      update: { points: 2 },
      select: (s) => s.fields('code'),
    }),
  };
}

function invalidParameters(repository: Repository<Entry>): void {
  // @ts-expect-error Direction is a fixed enum.
  void repository.findMany({ direction: 'reverse' });
  // @ts-expect-error Distinct must be a nonempty field tuple.
  void repository.findMany({ distinct: [] });
  // @ts-expect-error Distinct fields belong to the record type.
  void repository.findMany({ distinct: ['missing'] });
  // @ts-expect-error Cursor fields belong to the record type.
  void repository.findMany({ cursor: { missing: 1 } });
  // @ts-expect-error Streaming is consumed through findMany, not a separate public API.
  void repository.stream({ offset: 1 });
  // @ts-expect-error GroupBy keys must be nonempty.
  void repository.groupBy({ by: [], aggregate: (a) => ({ n: a.count() }) });
  void repository.updateMany({
    all: true,
    values: { points: 1 },
    // @ts-expect-error Bulk mutations do not accept a single optimistic version.
    ifVersion: 1,
  });
  // @ts-expect-error Single mutations require an explicit filter.
  void repository.deleteOne({ all: true });
  // @ts-expect-error DescribeMutation is metadata-only and accepts no execution context.
  void repository.describeMutation({ operation: 'createOne', context: {} });
}

it('preserves mutation projections and constrains shared query parameters', () => {
  type Results = ReturnType<typeof _results>;
  expectTypeOf<Results['create']>().toEqualTypeOf<
    Promise<CreateManyResult<{ code: string }>>
  >();
  expectTypeOf<Results['update']>().toEqualTypeOf<
    Promise<UpdateManyResult<{ points: number }>>
  >();
  expectTypeOf<Results['deleteOne']>().toEqualTypeOf<
    Promise<DeleteOneResult<{ status: string }>>
  >();
  expectTypeOf<Results['deleteMany']>().toEqualTypeOf<
    Promise<DeleteManyResult>
  >();
  expectTypeOf<Results['upsert']>().toEqualTypeOf<
    Promise<SingleMutationResult<{ code: string }>>
  >();
  expect(invalidParameters).toBeTypeOf('function');
});
