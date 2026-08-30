import { expect, test } from 'vitest';
import routes from '../client/routes.ts';

test('does not register Knowledge Base application routes', () => {
  expect(routes).toEqual([]);
});
