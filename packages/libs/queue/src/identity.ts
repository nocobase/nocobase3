export interface QueueIdentity {
  namespace: string;
  queue: string;
  digest: string;
  redisPrefix: string;
  redisQueueName: string;
  postgresQueueName: string;
}

export function createQueueIdentity(
  _namespace: unknown,
  _queue: unknown,
): QueueIdentity {
  throw new Error('Queue identity is not implemented');
}
