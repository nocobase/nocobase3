import type { AppWebSocketMessageData } from '@nocobase/app-runtime/websocket';

export const REALTIME_MAX_MESSAGE_BYTES: number = 64 * 1024;

export type RealtimeClientMessage =
  | {
      type: 'subscribe';
      id?: string;
      topic: string;
    }
  | {
      type: 'unsubscribe';
      id?: string;
      subscriptionId?: string;
      topic?: string;
    }
  | {
      type: 'publish';
      id?: string;
      topic: string;
      payload: unknown;
    }
  | {
      type: 'ping';
      id?: string;
    };

export type RealtimeServerMessage =
  | {
      type: 'subscribed';
      id?: string;
      topic: string;
      subscriptionId: string;
    }
  | {
      type: 'unsubscribed';
      id?: string;
      subscriptionId?: string;
      topic?: string;
    }
  | {
      type: 'event';
      topic: string;
      payload: unknown;
      publishedAt: string;
    }
  | {
      type: 'error';
      id?: string;
      code: string;
      message: string;
    }
  | {
      type: 'pong';
      id?: string;
    };

export class RealtimeProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RealtimeProtocolError';
  }
}

export function parseRealtimeClientMessage(
  data: AppWebSocketMessageData,
): RealtimeClientMessage {
  const text = decodeRealtimeMessageData(data);
  if (new TextEncoder().encode(text).byteLength > REALTIME_MAX_MESSAGE_BYTES) {
    throw new RealtimeProtocolError(
      'MESSAGE_TOO_LARGE',
      'Realtime message is too large.',
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new RealtimeProtocolError(
      'INVALID_JSON',
      'Realtime message must be valid JSON.',
    );
  }

  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new RealtimeProtocolError(
      'INVALID_MESSAGE',
      'Realtime message type is required.',
    );
  }

  switch (value.type) {
    case 'subscribe':
      return {
        type: 'subscribe',
        id: optionalString(value.id),
        topic: requiredTopic(value.topic),
      };
    case 'unsubscribe': {
      const subscriptionId = optionalString(value.subscriptionId);
      const topic =
        value.topic === undefined ? undefined : requiredTopic(value.topic);
      if (!subscriptionId && !topic) {
        throw new RealtimeProtocolError(
          'INVALID_UNSUBSCRIBE',
          'Unsubscribe requires a subscriptionId or topic.',
        );
      }

      return {
        type: 'unsubscribe',
        id: optionalString(value.id),
        subscriptionId,
        topic,
      };
    }
    case 'publish':
      return {
        type: 'publish',
        id: optionalString(value.id),
        topic: requiredTopic(value.topic),
        payload: value.payload,
      };
    case 'ping':
      return {
        type: 'ping',
        id: optionalString(value.id),
      };
    default:
      throw new RealtimeProtocolError(
        'UNKNOWN_MESSAGE_TYPE',
        `Unknown realtime message type "${value.type}".`,
      );
  }
}

export function encodeRealtimeServerMessage(
  message: RealtimeServerMessage,
): string {
  return JSON.stringify(message);
}

export function validateRealtimeTopic(topic: string): void {
  if (!/^[a-z][a-z0-9:-]{0,127}$/.test(topic)) {
    throw new RealtimeProtocolError(
      'INVALID_TOPIC',
      'Realtime topic is invalid.',
    );
  }
}

function decodeRealtimeMessageData(data: AppWebSocketMessageData): string {
  if (typeof data === 'string') {
    return data;
  }

  return new TextDecoder().decode(data);
}

function requiredTopic(value: unknown): string {
  if (typeof value !== 'string') {
    throw new RealtimeProtocolError(
      'INVALID_TOPIC',
      'Realtime topic is required.',
    );
  }

  validateRealtimeTopic(value);
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
