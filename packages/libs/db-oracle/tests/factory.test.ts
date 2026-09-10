import { expect, it } from 'vitest';
import oracle from '../src/index.js';
it('binds its driver', () =>
  expect(oracle().databaseDriver).toBe(oracle.driver));
