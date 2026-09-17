import { expect, it } from 'vitest';
import * as queue from '../src/queue/index.js';

it('exposes only the application-scoped queue provider and token', () => {
  expect(Object.keys(queue).sort()).toEqual([
    'QueueServiceProvider',
    'queueServiceToken',
  ]);
});
