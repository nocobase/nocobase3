import { expect, it } from 'vitest';
import { createQueueService } from '../../src/service.js';
import { selectedBackend } from '../helpers/backend-harness.js';

it.skipIf(selectedBackend() !== 'redis')(
  'uses explicit Redis connection options for producer and Worker',
  async () => {
    const service = createQueueService({
      namespace: `${process.env.QUEUE_TEST_RUN}-connection`,
      queueBackend: 'redis',
      connection: {
        host: '127.0.0.1',
        port: Number(process.env.QUEUE_TEST_REDIS_PORT),
      },
    });
    const received: unknown[] = [];
    service.consumer('jobs').consume(async (_channel, message) => {
      received.push(message);
    });
    const producer = service.producer('jobs');
    try {
      await service.setup();
      await producer.publish('event', { explicit: true });
      await expect.poll(() => received).toEqual([{ explicit: true }]);
    } finally {
      await service.shutdown();
    }
  },
);
