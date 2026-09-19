import { expect, expectTypeOf, it } from 'vitest';
import type {
  Repository,
  SingleMutationResult,
  ValuesBuilder,
  NumericMutationBuilder,
} from '../../../src/index.js';

function _selectedCreate(
  repository: Repository<{ code: string; title: string; points: number }>,
) {
  return repository.createOne({
    values: (v) => {
      expectTypeOf(v).toEqualTypeOf<ValuesBuilder>();
      return {
        code: v.variable('$code'),
        title: v.literal('Title'),
        points: 1,
      };
    },
    context: { code: 'A' },
    select: (s) => s.fields('code'),
  });
}

it('preserves select inference with a values callback', () => {
  expectTypeOf<ReturnType<typeof _selectedCreate>>().toEqualTypeOf<
    Promise<SingleMutationResult<{ code: string }>>
  >();
});

function typedAtomicUpdates(
  repository: Repository<{ id: number; balance: number; enabled: boolean }>,
): void {
  void repository.updateOne({
    filter: { id: 1 },
    values: {
      balance: (value) => {
        expectTypeOf(value).toEqualTypeOf<NumericMutationBuilder>();
        return value.increment(1);
      },
    },
  });
  void repository.updateMany({
    all: true,
    values: { balance: (value) => value.multiply(2) },
  });
  void repository.updateOne({
    filter: { id: 1 },
    // @ts-expect-error Boolean fields do not accept numeric operations.
    values: { enabled: { increment: 1 } },
  });
}

it('exposes contextual numeric Builder types', () => {
  expect(typedAtomicUpdates).toBeTypeOf('function');
});
