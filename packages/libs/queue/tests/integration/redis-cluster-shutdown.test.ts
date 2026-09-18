import { setImmediate } from 'node:timers/promises';
import { Cluster } from 'ioredis';
import { expect, it } from 'vitest';
import { createServiceRedisBackend } from '../../src/backends/redis.js';
import { settlesWithin } from '../../src/lifecycle.js';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'cluster')(
  'settles repeated blocking disconnects after every Cluster node closes and allows a new generation',
  async () => {
    const harness = await createBackendHarness();
    if (!(harness.connection instanceof Cluster))
      throw new Error('Expected Cluster fixture');
    const caller = harness.connection;
    const backend = createServiceRedisBackend(
      'shutdown',
      { connection: caller },
      { withBlockingConnection: true },
    );
    backend.on('error', () => {});
    try {
      await backend.waitUntilReady();
      // Opening all masters makes the trailing node-close events deterministic.
      const { RedisQueueBackend } = await import('bullmq');
      if (!(backend instanceof RedisQueueBackend))
        throw new Error('Expected Redis backend');
      const blocking = await backend.blockingClient;
      if (!blocking?.nodes) throw new Error('Expected blocking Cluster');
      for (let generation = 0; generation < 2; generation++) {
        const nodes = blocking.nodes();
        await Promise.all(nodes.map((node) => node.info()));
        const ended = new Set<unknown>();
        for (const node of nodes) node.once('end', () => ended.add(node));
        await backend.disconnectBlocking(true);
        await expect.poll(() => ended.size).toBe(nodes.length);
        await setImmediate();
        // ioredis can report close after end when another node drains the pool.
        expect(
          await settlesWithin(backend.disconnectBlocking(true), 1000),
        ).toBe(true);
        if (generation === 0) {
          await backend.reconnectBlocking();
          expect(blocking.status).toBe('ready');
        }
      }
      expect(await settlesWithin(backend.close(), 1000)).toBe(true);
      expect(await caller.ping()).toBe('PONG');
    } finally {
      await settlesWithin(backend.close(), 1000);
      await harness.close();
    }
  },
);
