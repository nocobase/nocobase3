import { resolvePublishOptions } from './config.js';
import { validateQueueName } from './identity.js';
import { encodeQueueMessage } from './serialization.js';
import type { QueueEnvelope } from './serialization.js';
import type { PublishOptions } from './types.js';
import type { JobsOptions } from 'bullmq';
import type { IQueueBackend, Queue } from 'bullmq';
import type { QueueProducer } from './service.js';
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
    validateQueueName(channel, 'channel');
    const data = encodeQueueMessage(message);
    const { jobIdProducer, ...opts } = options;
    const id = jobIdProducer?.(context.name, channel, message);
    return {
      name: channel,
      data,
      opts: { ...opts, ...(id === undefined ? {} : { jobId: id }) },
    };
  }
  return {
    async publish(channel, message, options) {
      const finish = context.beginOperation?.();
      try {
        const queue = await context.queue();
        const prepared = prepare(
          channel,
          message,
          resolvePublishOptions(context.configuration(), options),
        );
        const job = await queue.add(
          prepared.name,
          prepared.data,
          prepared.opts,
        );
        if (job.id === undefined)
          throw new Error('Queue backend returned no job ID');
        return { jobId: job.id };
      } finally {
        finish?.();
      }
    },
    async publishMany(batches, options) {
      const finish = context.beginOperation?.();
      try {
        const queue = await context.queue();
        const resolved = resolvePublishOptions(
          context.configuration(),
          options,
        );
        const prepared = batches.map(({ channel, message }) =>
          prepare(channel, message, resolved),
        );
        const jobs = await queue.addBulk(prepared);
        return jobs.map((job) => {
          if (job.id === undefined)
            throw new Error('Queue backend returned no job ID');
          return { jobId: job.id };
        });
      } finally {
        finish?.();
      }
    },
  };
}
