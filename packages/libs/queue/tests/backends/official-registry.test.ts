import { createRedisBackend } from 'bullmq';
import { expect, it } from 'vitest';
import { createBackendRegistry } from '../../src/backends/registry.js';

it('registers the official Redis factory without a service adapter', () => {
  const registry = createBackendRegistry();
  expect(registry.resolve('redis')).toBe(createRedisBackend);
});

it('keeps custom names and factories local to each service registry', () => {
  const first = createBackendRegistry();
  const second = createBackendRegistry();
  first.register('postgres', createRedisBackend);
  expect(first.resolve('postgres')).toBe(createRedisBackend);
  expect(() => second.resolve('postgres')).toThrow('Unknown queue backend');
});
