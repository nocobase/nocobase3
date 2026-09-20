import {
  assertProducerDeadline,
  producerDeadline,
  PRODUCER_REQUEST_TIMEOUT_MS,
  waitForProducerDeadline,
} from './operation-deadline.js';
import { resolvePublishOptions } from './config.js';
import { encodeQueueMessage } from './serialization.js';
import type { QueueEnvelope } from './serialization.js';
import type { PublishOptions } from './types.js';
import type { JobsOptions } from 'bullmq';
import type { IQueueBackend, Queue } from 'bullmq';
import type { PublishReceipt, QueueProducer } from './service.js';
import type { ResolvedQueueConfiguration } from './types.js';

export type ProducerQueue = Queue<
  unknown,
  unknown,
  string,
  unknown,
  unknown,
  string,
  IQueueBackend
>;
export interface ProducerContext {
  name: string;
  queue(): Promise<ProducerQueue>;
  configuration(): ResolvedQueueConfiguration;
  beginOperation?(): () => void;
}

interface PreparedJob {
  name: string;
  data: QueueEnvelope;
  opts: JobsOptions;
}

export function createQueueProducer(context: ProducerContext): QueueProducer {
  function prepare(
    channel: string,
    message: unknown,
    options: PublishOptions,
  ): PreparedJob {
    if (typeof channel !== 'string')
      throw new TypeError('channel must be a string');
    const data = encodeQueueMessage(message);
    const { jobIdProducer, ...opts } = options;
    const id = jobIdProducer?.(context.name, channel, message);
    return {
      name: channel,
      data,
      opts: { ...opts, ...(id === undefined ? {} : { jobId: id }) },
    };
  }
  async function run<T>(
    operation: (deadline: number) => Promise<T>,
  ): Promise<T> {
    const deadline = performance.now() + PRODUCER_REQUEST_TIMEOUT_MS;
    const finish = context.beginOperation?.();
    const pending = producerDeadline.run(deadline, async () => {
      try {
        assertProducerDeadline(deadline);
        return await operation(deadline);
      } finally {
        // Caller timeout is not settlement: shutdown still owns this operation.
        finish?.();
      }
    });
    return waitForProducerDeadline(pending, deadline);
  }

  function receipt(job: { id?: string } | undefined): PublishReceipt {
    const id = job?.id;
    if (typeof id !== 'string')
      throw new Error('Queue backend returned an invalid job ID');
    return { jobId: id };
  }

  return {
    async publish(channel, message, options) {
      return run(async (deadline) => {
        const queue = await context.queue();
        assertProducerDeadline(deadline);
        const prepared = prepare(
          channel,
          message,
          resolvePublishOptions(context.configuration(), options),
        );
        assertProducerDeadline(deadline);
        const job = await queue.add(
          prepared.name,
          prepared.data,
          prepared.opts,
        );
        return receipt(job);
      });
    },
    async publishMany(batches, options) {
      return run(async (deadline) => {
        const queue = await context.queue();
        assertProducerDeadline(deadline);
        const resolved = resolvePublishOptions(
          context.configuration(),
          options,
        );
        const prepared = batches.map(({ channel, message }) =>
          prepare(channel, message, resolved),
        );
        assertProducerDeadline(deadline);
        const jobs = await queue.addBulk(prepared);
        if (!Array.isArray(jobs) || jobs.length !== prepared.length)
          throw new Error(
            'Queue backend returned an invalid bulk receipt count',
          );
        return Array.from(jobs, receipt);
      });
    },
  };
}
