import { afterEach, expect, it, vi } from 'vitest';

import {
  createRealtimeClient,
  type RealtimeEvent,
} from '../src/realtime/index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('connects lazily, dispatches events, and restores topics after session changes', () => {
  vi.useFakeTimers();
  const sockets: MockWebSocket[] = [];
  const sentMessages: Record<string, unknown>[] = [];

  class MockWebSocket {
    public static readonly CONNECTING = 0;
    public static readonly OPEN = 1;
    public readyState = MockWebSocket.CONNECTING;
    public onopen?: () => void;
    public onmessage?: (event: { readonly data: string }) => void;
    public onerror?: () => void;
    public onclose?: () => void;

    public constructor(public readonly url: string) {
      sockets.push(this);
    }

    public send(message: string): void {
      sentMessages.push(JSON.parse(message) as Record<string, unknown>);
    }

    public close(): void {
      this.readyState = 3;
    }

    public open(): void {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }

    public message(value: Record<string, unknown>): void {
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
  const opened = vi.fn();
  const listenerError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const client = createRealtimeClient({ resolveUrl: () => '/main/ws' });
  client.onOpen(opened);
  expect(sockets).toHaveLength(0);

  const unsubscribeThrowing = client.subscribe('notifications:in-app', () => {
    throw new Error('listener failed');
  });
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
  expect(opened).toHaveBeenCalledOnce();

  sockets[0]?.message({
    type: 'event',
    topic: 'notifications:in-app',
    payload: { kind: 'inbox.changed' },
    publishedAt: '2026-08-26T00:00:00.000Z',
  });
  expect(events).toHaveLength(1);
  expect(listenerError).toHaveBeenCalledWith(
    'Realtime listener for topic "notifications:in-app" failed.',
    expect.any(Error),
  );

  vi.advanceTimersByTime(300_000);
  expect(sentMessages.at(-1)).toEqual({ type: 'ping' });

  client.refreshSession();
  vi.advanceTimersByTime(300_000);
  expect(sentMessages.at(-1)).toEqual({ type: 'ping' });
  expect(
    sentMessages.filter((message) => message.type === 'ping'),
  ).toHaveLength(1);
  sockets[1]?.open();
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: 'subscribe:notifications:in-app',
    topic: 'notifications:in-app',
  });
  expect(opened).toHaveBeenCalledTimes(2);

  const unsubscribeOther = client.subscribe('notifications:other', vi.fn());
  unsubscribeThrowing();
  unsubscribe();
  expect(sentMessages.at(-1)).toEqual({
    type: 'unsubscribe',
    topic: 'notifications:in-app',
  });

  const unsubscribeReplacement = client.subscribe(
    'notifications:in-app',
    vi.fn(),
  );
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: 'subscribe:notifications:in-app',
    topic: 'notifications:in-app',
  });

  unsubscribeReplacement();
  unsubscribeOther();
});
