import { describe, expect, it } from 'vitest';
import {
  resolvePublishOptions,
  resolveQueueConfiguration,
  resolveQueueTimeouts,
} from '../src/config.js';
import type { ResolvedQueueConfiguration } from '../src/types.js';

const base: ResolvedQueueConfiguration = {
  namespace: 'app',
  queueBackend: 'inMemory',
  concurrency: 1,
  attempts: 0,
};
const resolve = (options: Record<string, unknown> = {}, manual?: unknown) =>
  resolveQueueConfiguration({ namespace: 'app', ...options }, 'email', manual);

describe('queue configuration contract', () => {
  it('uses verified defaults without writing absent backend rate/cleanup settings', () => {
    expect(resolve()).toMatchObject(base);
    expect(resolve()).not.toHaveProperty('rateLimit');
    expect(resolve()).not.toHaveProperty('removeOnComplete');
    expect(resolveQueueTimeouts({})).toEqual({
      setupTimeoutMs: 10000,
      shutdownTimeoutMs: 30000,
      cancellationGraceMs: 5000,
    });
    expect(resolvePublishOptions(base)).toMatchObject({
      priority: 0,
      delay: 0,
      attempts: 0,
    });
  });

  it('merges global, named, manual and per-publish layers without mutating inputs', () => {
    const global = Object.freeze({
      namespace: 'global',
      concurrency: 2,
      attempts: 2,
      removeOnComplete: { age: 60, count: 10 },
      queues: { email: { namespace: 'named', concurrency: 3, attempts: 3 } },
    });
    const manual = Object.freeze({ concurrency: 4, attempts: 4 });
    const resolved = resolveQueueConfiguration(global, 'email', manual);
    expect(resolved).toMatchObject({
      namespace: 'named',
      concurrency: 4,
      attempts: 4,
    });
    expect(
      resolvePublishOptions(resolved, {
        attempts: 5,
        removeOnComplete: { count: 1 },
      }),
    ).toMatchObject({ attempts: 5, removeOnComplete: { count: 1 } });
    expect(resolved.removeOnComplete).toEqual({ age: 60, count: 10 });
    expect(global.concurrency).toBe(2);
    expect(resolveQueueConfiguration(global, 'undeclared')).toMatchObject({
      namespace: 'global',
      concurrency: 2,
      attempts: 2,
    });
  });

  it('ignores undefined, replaces objects and retains explicit rateLimit:null', () => {
    const result = resolve(
      {
        concurrency: 3,
        backoff: { type: 'fixed', delay: 10, jitter: 0.5 },
        rateLimit: { max: 4, duration: 1000 },
      },
      {
        concurrency: undefined,
        backoff: { type: 'exponential', delay: 20 },
        rateLimit: null,
      },
    );
    expect(result.concurrency).toBe(3);
    expect(result.backoff).toEqual({ type: 'exponential', delay: 20 });
    expect(result.rateLimit).toBeNull();
    expect(
      resolvePublishOptions({ ...base, attempts: 4 }, { attempts: undefined })
        .attempts,
    ).toBe(4);
  });

  it('replaces connection objects and validates inherited connection against the final backend', () => {
    expect(
      resolve({
        queueBackend: 'redis',
        connection: { host: 'first', db: 4 },
        queues: { email: { connection: { host: 'second' } } },
      }).connection,
    ).toEqual({ host: 'second' });
    expect(() =>
      resolve({
        queueBackend: 'redis',
        connection: { host: 'first' },
        queues: { email: { queueBackend: 'inMemory' } },
      }),
    ).toThrow(/connection/u);
    expect(
      resolve({
        queueBackend: 'redis',
        connection: { host: 'first' },
        queues: { email: { queueBackend: 'inMemory', connection: {} } },
      }).queueBackend,
    ).toBe('inMemory');
    expect(resolve({ queueBackend: 'custom', connection: 42 }).connection).toBe(
      42,
    );
  });

  it('uses own queue entries for prototype-sensitive names', () => {
    const queues = Object.fromEntries([['__proto__', { concurrency: 7 }]]);
    expect(
      resolveQueueConfiguration({ namespace: 'app', queues }, '__proto__')
        .concurrency,
    ).toBe(7);
    expect(
      resolveQueueConfiguration({ namespace: 'app', queues }, 'constructor')
        .concurrency,
    ).toBe(1);
  });

  it.each([
    ['concurrency', 0],
    ['concurrency', -1],
    ['concurrency', 1.5],
    ['concurrency', Infinity],
    ['concurrency', NaN],
    ['concurrency', 2147483648],
    ['attempts', -1],
    ['attempts', 1.5],
    ['attempts', 2147483648],
    ['attempts', '2'],
    ['rateLimit', { max: 0, duration: 1 }],
    ['rateLimit', { max: 1, duration: 0 }],
    ['rateLimit', { max: 1, duration: Infinity }],
    ['removeOnComplete', -1],
    ['removeOnFail', { age: -1 }],
    ['removeOnComplete', { count: 1.5 }],
    ['removeOnFail', { limit: -1 }],
    ['removeOnFail', { age: Number.MAX_SAFE_INTEGER }],
    ['jobIdProducer', 42],
    ['backoff', -1],
    ['backoff', { type: 'custom', delay: 1 }],
    ['backoff', { type: 'fixed', delay: 1, jitter: 1.01 }],
    ['backoff', { type: 'fixed', delay: 1, unknown: true }],
    ['unknown', true],
    ['queues', []],
  ])('rejects invalid %s=%j before any resources exist', (key, value) => {
    expect(() => resolve({ [key]: value })).toThrow(
      new RegExp(String(key), 'u'),
    );
  });

  it.each([
    'namespace',
    'queueBackend',
    'connection',
    'priority',
    'delay',
    'unknown',
  ])('rejects runtime reconfiguration field %s', (field) => {
    expect(() => resolve({}, { [field]: 'invalid' })).toThrow(
      new RegExp(field, 'u'),
    );
  });

  it.each([
    'concurrency',
    'rateLimit',
    'namespace',
    'queueBackend',
    'connection',
    'unknown',
  ])('rejects publish-only extraneous field %s', (field) => {
    expect(() => resolvePublishOptions(base, { [field]: 1 })).toThrow(
      new RegExp(field, 'u'),
    );
  });

  it.each(['attempts', 'priority', 'delay'])(
    'rejects explicit null publish %s rather than treating it as omitted',
    (field) => {
      expect(() => resolvePublishOptions(base, { [field]: null })).toThrow(
        new RegExp(field, 'u'),
      );
    },
  );

  it.each([
    ['setupTimeoutMs', 0],
    ['setupTimeoutMs', 2147483648],
    ['shutdownTimeoutMs', -1],
    ['cancellationGraceMs', Infinity],
  ])('rejects invalid lifecycle timer %s', (field, value) => {
    expect(() => resolveQueueTimeouts({ [field]: value })).toThrow(
      new RegExp(String(field), 'u'),
    );
  });

  it('accepts zero shutdown stages and normalizes undefined lifecycle fields', () => {
    expect(
      resolveQueueTimeouts({
        setupTimeoutMs: undefined,
        shutdownTimeoutMs: 0,
        cancellationGraceMs: 0,
      }),
    ).toEqual({
      setupTimeoutMs: 10000,
      shutdownTimeoutMs: 0,
      cancellationGraceMs: 0,
    });
  });

  it('preserves cleanup variants and backend-dependent KeepJobs.limit', () => {
    for (const retention of [
      true,
      false,
      0,
      2,
      { age: 0, count: 0, limit: 0 },
    ]) {
      expect(resolve({ removeOnComplete: retention }).removeOnComplete).toEqual(
        retention,
      );
    }
    // KeepJobs requires age or count in its declaration; normalize untyped keep-all objects.
    expect(resolve({ removeOnComplete: {} }).removeOnComplete).toBe(false);
    expect(resolve({ removeOnComplete: { limit: 1 } }).removeOnComplete).toBe(
      false,
    );
  });

  it('accepts long stored delay but rejects score overflow, fractions and excessive priority', () => {
    const now = 1800000000000;
    expect(
      resolvePublishOptions(base, { delay: 30 * 86400000 }, now).delay,
    ).toBe(30 * 86400000);
    expect(
      resolvePublishOptions(base, { delay: 2199023255551 - now }, now).delay,
    ).toBe(2199023255551 - now);
    expect(() =>
      resolvePublishOptions(base, { delay: 2199023255552 - now }, now),
    ).toThrow(/delay/u);
    for (const delay of [-1, NaN, Infinity, 0.5])
      expect(() => resolvePublishOptions(base, { delay }, now)).toThrow(
        /delay/u,
      );
    expect(
      resolvePublishOptions(base, { priority: 2097151 }, now).priority,
    ).toBe(2097151);
    expect(() =>
      resolvePublishOptions(base, { priority: 2097152 }, now),
    ).toThrow(/priority/u);
  });

  it('rejects exponential overflow even for zero base and revalidates per-publish attempts', () => {
    expect(() =>
      resolve({ attempts: 1026, backoff: { type: 'exponential', delay: 0 } }),
    ).toThrow(/backoff/u);
    expect(() =>
      resolvePublishOptions(
        { ...base, backoff: { type: 'exponential', delay: 0 } },
        { attempts: 1026 },
      ),
    ).toThrow(/backoff/u);
    expect(
      resolve({
        attempts: 5,
        backoff: { type: 'exponential', delay: 5, jitter: 0 },
      }).attempts,
    ).toBe(5);
  });

  it.each([
    ['redis', { redisOptions: { port: 0 } }],
    ['redis', { lazyConnect: 'yes' }],
    ['redis', { maxRetriesPerRequest: -1 }],
  ])('validates known %s driver settings %j', (queueBackend, connection) => {
    expect(() => resolve({ queueBackend, connection })).toThrow(/connection/u);
  });

  it.each([
    ['redis', undefined],
    ['redis', 'redis://localhost'],
    ['redis', { keyPrefix: 'bad' }],
    ['redis', { port: -1 }],
    ['inMemory', { host: 'not-memory' }],
  ])('rejects invalid %s connection %j', (queueBackend, connection) => {
    expect(() => resolve({ queueBackend, connection })).toThrow(/connection/u);
  });
});
