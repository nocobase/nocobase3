export interface QueueEnvelope {
  version: 1;
  payload: string;
}

export function encodeQueueMessage(message: unknown): QueueEnvelope {
  const payload = JSON.stringify(message === undefined ? {} : message);
  if (payload === undefined)
    throw new TypeError('Queue message must serialize to JSON text');
  return { version: 1, payload };
}

export function decodeQueueMessage(envelope: unknown): unknown {
  if (
    typeof envelope !== 'object' ||
    envelope === null ||
    Array.isArray(envelope) ||
    !('version' in envelope) ||
    envelope.version !== 1 ||
    !('payload' in envelope) ||
    typeof envelope.payload !== 'string' ||
    Object.keys(envelope).length !== 2
  ) {
    throw new TypeError('Invalid queue message envelope');
  }
  const message: unknown = JSON.parse(envelope.payload);
  return message;
}
