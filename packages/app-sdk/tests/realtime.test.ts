import { afterEach, expect, it, vi } from 'vitest';

import {
  createRealtimeClient,
  type RealtimeEvent,
} from '../src/realtime/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('subscribes to topics and restores them after the session changes', () => {
  vi.useFakeTimers();
  const sockets: MockWebSocket[] = [];
  const sentMessages: Record<string, unknown>[] = [];

  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    readyState = MockWebSocket.CONNECTING;
    onopen?: () => void;
    onmessage?: (event: { readonly data: string }) => void;
    onerror?: () => void;
    onclose?: () => void;

    constructor(readonly url: string) {
      sockets.push(this);
    }

    send(message: string): void {
      sentMessages.push(JSON.parse(message) as Record<string, unknown>);
    }

    close(): void {
      this.readyState = 3;
    }

    open(): void {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }

    message(value: Record<string, unknown>): void {
      this.onmessage?.({ data: JSON.stringify(value) });
    }
  }

  vi.stubGlobal('window', {
    location: {
      href: 'https://example.com/main/',
      origin: 'https://example.com',
    },
  });
  vi.stubGlobal('WebSocket', MockWebSocket);

  const events: RealtimeEvent<{ readonly kind: string }>[] = [];
  const client = createRealtimeClient({ resolveUrl: () => '/main/ws' });
  const unsubscribe = client.subscribe<{ readonly kind: string }>(
    'notifications:in-app',
    (event) => events.push(event),
  );

  sockets[0]?.open();
  expect(sockets[0]?.url).toBe('wss://example.com/main/ws');
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: 'subscribe:notifications:in-app',
    topic: 'notifications:in-app',
  });

  sockets[0]?.message({
    type: 'event',
    topic: 'notifications:in-app',
    payload: { kind: 'inbox.changed' },
    publishedAt: '2026-08-26T00:00:00.000Z',
  });
  expect(events).toHaveLength(1);

  vi.advanceTimersByTime(300_000);
  expect(sentMessages.at(-1)).toEqual({ type: 'ping' });

  client.refreshSession();
  sockets[1]?.open();
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: 'subscribe:notifications:in-app',
    topic: 'notifications:in-app',
  });

  unsubscribe();
  expect(sentMessages.at(-1)).toEqual({
    type: 'unsubscribe',
    topic: 'notifications:in-app',
  });
});
