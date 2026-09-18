import { expect, it } from 'vitest';

import { isUniqueConstraintViolation } from '../../../src/database/internal/unique-constraint.js';

it('recognizes Dameng unique violations, including wrapped driver errors', () => {
  const error = { errCode: -6602 };
  expect(isUniqueConstraintViolation(error)).toBe(true);
  expect(
    isUniqueConstraintViolation(new Error('insert failed', { cause: error })),
  ).toBe(true);
  expect(isUniqueConstraintViolation({ originalError: error })).toBe(true);
});

it('does not treat other Dameng errors or message text as unique violations', () => {
  expect(isUniqueConstraintViolation({ errCode: -6603 })).toBe(false);
  expect(
    isUniqueConstraintViolation(new Error('[-6602] user supplied text')),
  ).toBe(false);
});
