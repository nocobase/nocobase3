export interface QueueEnvelope {
  version: 1;
  payload: string;
}

export function encodeQueueMessage(_message: unknown): QueueEnvelope {
  throw new Error('Queue serialization is not implemented');
}

export function decodeQueueMessage(_envelope: unknown): unknown {
  throw new Error('Queue deserialization is not implemented');
}
