import { expect, it } from 'vitest';
import { resolveRedisConnection } from '../../src/backends/redis.js';

it('copies standalone options without modifying the caller', () => {
  const input = Object.freeze({
    host: 'localhost',
    port: 6379,
    db: 0,
    username: 'user',
    password: 'secret',
    connectTimeout: 100,
  });
  expect(resolveRedisConnection(input)).toEqual(input);
  expect(resolveRedisConnection(input)).not.toBe(input);
});

it.each([
  { keyPrefix: '' },
  { keyPrefix: 'unsafe' },
  { port: 0 },
  { port: 65536 },
  { db: -1 },
  { connectTimeout: NaN },
  { password: 1 },
  { host: false },
  { misspelled: true },
  { redisOptions: {} },
])(
  'rejects unsupported or invalid standalone options %j before connection',
  (options) => {
    expect(() => resolveRedisConnection(options)).toThrow();
  },
);

it('preserves a valid Redis URL without exposing its credentials in validation errors', () => {
  const url = 'redis://user:password@localhost:6379/2';
  expect(resolveRedisConnection({ url })).toEqual({ url });
  for (const invalid of [
    'https://user:password@localhost',
    'redis://user:password@',
    'not-a-url',
  ]) {
    expect(() => resolveRedisConnection({ url: invalid })).toThrow(
      'Invalid connection.url',
    );
    try {
      resolveRedisConnection({ url: invalid });
    } catch (error) {
      expect(String(error)).not.toContain('password');
    }
  }
});
