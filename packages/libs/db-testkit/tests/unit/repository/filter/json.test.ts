import { expect, it } from 'vitest';
import { validateJsonCondition } from '@nocobase/db/testing';
import { DefaultFilterBuilder } from '@nocobase/db/testing';

it('rejects non-JSON operands and malformed JSON operations', () => {
  const json = new DefaultFilterBuilder().json('payload');
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  for (const value of [
    undefined,
    Infinity,
    NaN,
    new Date(),
    circular,
    { a: undefined },
  ]) {
    expect(() =>
      validateJsonCondition({ ...json.eq(null), value: value as never }, []),
    ).toThrow();
  }
  expect(() =>
    validateJsonCondition({ ...json.has(null), value: {} }, []),
  ).toThrow();
  expect(() =>
    validateJsonCondition({ ...json.isEmpty(), value: 1 }, []),
  ).toThrow();
  expect(() => validateJsonCondition(json.path([]).eq(null), [])).toThrow();
});
