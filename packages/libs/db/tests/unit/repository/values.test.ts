import { expect, expectTypeOf, it } from 'vitest';
import type {
  Repository,
  SingleMutationResult,
  ValuesBuilder,
} from '../../../src/index.js';
import {
  DefaultValuesBuilder,
  resolveMutationValue,
  validateResolvedMutationValue,
} from '../../../src/repository/values.js';
import {
  isNumericMutation,
  normalizeNumericMutation,
} from '../../../src/repository/numeric-mutation.js';

const builder = new DefaultValuesBuilder();
const path = ['values', 'payload'];

it('keeps literal and context-supplied expression shapes as data', () => {
  const marker = builder.variable('$missing');
  expect(
    resolveMutationValue(builder.literal(marker), undefined, path).value,
  ).toBe(marker);
  expect(
    resolveMutationValue(
      builder.variable('$payload'),
      { payload: marker },
      path,
    ).value,
  ).toBe(marker);
  const nested = { child: marker };
  expect(resolveMutationValue(nested, undefined, path)).toEqual({
    value: nested,
    expression: false,
  });
  const operation = {
    kind: 'numericMutation',
    operation: 'increment',
    value: 10,
  };
  expect(isNumericMutation(operation)).toBe(false);
  expect(
    isNumericMutation(
      normalizeNumericMutation(
        { name: 'entries' },
        { name: 'points', type: 'integer' },
        { increment: 1 },
        true,
      ),
    ),
  ).toBe(true);
});

it.each(['input', '$', '$input.', '$.input', '$input..name'])(
  'rejects malformed variable path %s',
  (variable) => {
    expect(() =>
      resolveMutationValue(builder.variable(variable), {}, path),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CONTEXT', path }));
  },
);

it('uses own properties, including array indices and null-prototype objects', () => {
  const data = Object.create(null) as Record<string, unknown>;
  data.title = 'Safe';
  expect(
    resolveMutationValue(builder.variable('$data.title'), { data }, path).value,
  ).toBe('Safe');
  expect(
    resolveMutationValue(
      builder.variable('$items.0'),
      { items: ['first'] },
      path,
    ).value,
  ).toBe('first');
  expect(() =>
    resolveMutationValue(
      builder.variable('$data.toString'),
      { data: {} },
      path,
    ),
  ).toThrow(expect.objectContaining({ code: 'VARIABLE_NOT_FOUND' }));
  expect(() =>
    resolveMutationValue(
      builder.variable('$data.__proto__'),
      { data: {} },
      path,
    ),
  ).toThrow(expect.objectContaining({ code: 'VARIABLE_NOT_FOUND' }));
});

it('rejects malformed wrappers and undefined literal values', () => {
  for (const value of [
    { kind: 'literal' },
    { kind: 'literal', value: 1, extra: true },
    builder.literal(undefined),
    { kind: 'variable', path: '$title', extra: true },
  ])
    expect(() => resolveMutationValue(value, { title: 'x' }, path)).toThrow();
});

it('validates resolved field data without coercion or JSON expression execution', () => {
  const validate = (type: string, value: unknown, nullable = false) =>
    validateResolvedMutationValue(
      { name: 'payload', type, nullable },
      { value, expression: true, variable: '$payload' },
      'entries',
      path,
    );
  expect(validate('boolean', false)).toBe(false);
  expect(validate('integer', 0)).toBe(0);
  expect(validate('string', '')).toBe('');
  expect(validate('json', null, true)).toBeNull();
  for (const [type, value] of [
    ['integer', '1'],
    ['integer', 1.5],
    ['boolean', 1],
    ['string', null],
    ['json', { value: undefined }],
    ['json', { value: 1n }],
  ] as const)
    expect(() => validate(type, value)).toThrow(
      expect.objectContaining({
        code: 'INVALID_MUTATION',
        path,
        details: { variable: '$payload' },
      }),
    );
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  expect(() => validate('json', cyclic)).toThrow();
});

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
