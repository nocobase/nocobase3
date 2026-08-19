import { randomUUID } from 'node:crypto';

export interface PortalLiveEvent {
  readonly version: 1;
  readonly streamId: string;
  readonly eventId: string;
  readonly sequence: number;
  readonly channel: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: { readonly ids?: readonly string[] };
}

export interface PortalLivePublishInput {
  readonly appId: string;
  readonly userId: string;
  readonly channel: string;
  readonly type: string;
  readonly payload: { readonly ids?: readonly string[] };
  readonly occurredAt?: string;
}

export interface PortalLiveCursor {
  readonly streamId: string;
  readonly sequence: number;
}

export interface PortalLivePublisher {
  publish(input: PortalLivePublishInput): PortalLiveEvent;
  replay(appId: string, userId: string, cursor?: PortalLiveCursor): PortalLiveReplay;
  subscribe(appId: string, userId: string, listener: (event: PortalLiveEvent) => void): () => void;
}

export type PortalLiveReplay =
  | { readonly kind: 'events'; readonly events: readonly PortalLiveEvent[]; readonly cursor: PortalLiveCursor }
  | { readonly kind: 'resync_required'; readonly cursor: PortalLiveCursor };

interface StreamState {
  readonly streamId: string;
  sequence: number;
  events: PortalLiveEvent[];
  listeners: Set<(event: PortalLiveEvent) => void>;
}

export function createMemoryPortalLivePublisher(options: { readonly maxEvents?: number } = {}): PortalLivePublisher {
  const streams = new Map<string, StreamState>();
  const maxEvents = options.maxEvents ?? 100;
  const getStream = (appId: string, userId: string): StreamState => {
    const key = `${appId}:${userId}`;
    let stream = streams.get(key);
    if (!stream) {
      stream = { streamId: randomUUID(), sequence: 0, events: [], listeners: new Set() };
      streams.set(key, stream);
    }
    return stream;
  };

  return {
    publish(input): PortalLiveEvent {
      const stream = getStream(input.appId, input.userId);
      const event: PortalLiveEvent = { version: 1, streamId: stream.streamId, eventId: randomUUID(), sequence: ++stream.sequence, channel: input.channel, type: input.type, occurredAt: input.occurredAt ?? new Date().toISOString(), payload: structuredClone(input.payload) };
      stream.events.push(event);
      if (stream.events.length > maxEvents) stream.events.splice(0, stream.events.length - maxEvents);
      for (const listener of stream.listeners) listener(event);
      return event;
    },
    replay(appId, userId, cursor): PortalLiveReplay {
      const stream = getStream(appId, userId);
      const currentCursor = { streamId: stream.streamId, sequence: stream.sequence };
      if (!cursor) return { kind: 'events', events: [], cursor: currentCursor };
      if (cursor.streamId !== stream.streamId || cursor.sequence > stream.sequence || (stream.events.length > 0 && cursor.sequence < stream.events[0].sequence - 1)) return { kind: 'resync_required', cursor: currentCursor };
      return { kind: 'events', events: stream.events.filter((event) => event.sequence > cursor.sequence), cursor: currentCursor };
    },
    subscribe(appId, userId, listener): () => void {
      const stream = getStream(appId, userId);
      stream.listeners.add(listener);
      return () => stream.listeners.delete(listener);
    },
  };
}
