import { createRedisBackend } from 'bullmq';
import { expect, it } from 'vitest';
import { createBackendRegistry } from '../../src/backends/registry.js';

// Driver watchdog/generation policy belongs to BullMQ, not this registry.
it('registers the official Redis factory by identity without an adapter wrapper', () => {
  const first = createBackendRegistry();
  const second = createBackendRegistry();
  expect(first.resolve('redis')).toBe(createRedisBackend);
  expect(second.resolve('redis')).toBe(createRedisBackend);
  expect(first.resolve('inMemory')).not.toBe(second.resolve('inMemory'));
});

it('keeps factory registration and freezing scoped to each registry', () => {
  const first = createBackendRegistry();
  const second = createBackendRegistry();
  first.register('application-owned', createRedisBackend);
  expect(first.resolve('application-owned')).toBe(createRedisBackend);
  expect(() => second.resolve('application-owned')).toThrow(
    'Unknown queue backend',
  );
  first.freeze();
  expect(() => first.register('late', createRedisBackend)).toThrow('frozen');
  second.register('late', createRedisBackend);
  expect(second.resolve('late')).toBe(createRedisBackend);
  expect(() => second.register('redis', createRedisBackend)).toThrow(
    'already registered',
  );
});
