import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import {
  createBackendHarness,
  selectedBackend,
} from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'cluster')(
  'uses owned Cluster duplicates for Unicode queue identity and bulk work',
  async () => {
    const harness = await createBackendHarness();
    const { Cluster } = await import('ioredis');
    if (!(harness.connection instanceof Cluster))
      throw new Error('Expected Cluster fixture');
    const owner = harness.connection;
    const { createQueueIdentity } = await import('../../src/identity.js');
    const clientIds = async (): Promise<string[]> => {
      const rows = await Promise.all(
        owner.nodes('master').map(async (node, index) => {
          const list = await node.client('LIST');
          if (typeof list !== 'string')
            throw new Error('Expected CLIENT LIST text');
          return list
            .trim()
            .split('\n')
            .map((line) => `${index}:${line.split(' ')[0]}`);
        }),
      );
      return rows.flat().sort();
    };
    await Promise.all(owner.nodes('master').map((node) => node.ping()));
    const before = await clientIds();
    const service = createQueueService({
      namespace: `${harness.namespace}-应用{one}`,
      queueBackend: 'redis',
      connection: harness.connection,
    });
    const received: unknown[] = [];
    service.consumer('任务:队列{two}').consume(async (_channel, message) => {
      received.push(message);
    });
    const producer = service.producer('任务:队列{two}');
    try {
      await service.setup();
      await producer.publishMany([
        { channel: 'event', message: 1 },
        { channel: 'event', message: 2 },
      ]);
      await expect.poll(() => received, { timeout: 5000 }).toEqual([1, 2]);
      const identity = createQueueIdentity(
        `${harness.namespace}-应用{one}`,
        '任务:队列{two}',
      );
      const keys = (
        await Promise.all(
          owner
            .nodes('master')
            .map((node) => node.keys(`${identity.redisPrefix}:*`)),
        )
      ).flat();
      expect(keys.length).toBeGreaterThan(0);
      expect(
        keys.every((key) =>
          key.startsWith(`${identity.redisPrefix}:${identity.redisQueueName}:`),
        ),
      ).toBe(true);
      const slots = await Promise.all(
        keys.map((key) => owner.cluster('KEYSLOT', key)),
      );
      expect(new Set(slots).size).toBe(1);
      await service.shutdown();
      await expect.poll(clientIds, { timeout: 5000 }).toEqual(before);
      expect(await owner.ping()).toBe('PONG');
    } finally {
      await service.shutdown().catch(() => {});
      await harness.close();
    }
  },
);
