import { createHash } from 'node:crypto';

export interface QueueIdentity {
  namespace: string;
  queue: string;
  digest: string;
  redisPrefix: string;
  redisQueueName: string;
}

export function validateQueueName(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    Buffer.byteLength(value, 'utf8') > 256
  ) {
    throw new TypeError(
      `${field} must be a nonblank string of at most 256 UTF-8 bytes`,
    );
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || (code >= 127 && code <= 159))
      throw new TypeError(`${field} must not contain control characters`);
  }
  return value;
}

export function createQueueIdentity(
  namespace: unknown,
  queue: unknown,
): QueueIdentity {
  const validNamespace = validateQueueName(namespace, 'namespace');
  const validQueue = validateQueueName(queue, 'queue');
  const digest = createHash('sha256')
    .update(JSON.stringify([validNamespace, validQueue]))
    .digest('hex');
  return {
    namespace: validNamespace,
    queue: validQueue,
    digest,
    redisPrefix: `nbq:{${digest}}`,
    redisQueueName: `q-${Buffer.from(validQueue, 'utf8').toString('base64url')}`,
  };
}
