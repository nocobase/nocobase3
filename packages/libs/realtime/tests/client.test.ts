import { afterEach, expect, it, vi } from 'vitest';

import { createRealtimeClient, type RealtimeEvent } from '../src/client.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('connects lazily, dispatches events, and restores topics after reconnecting', () => {
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
    location: { href: 'https://example.com/main/' },
  });
  vi.stubGlobal('WebSocket', MockWebSocket);

  const events: RealtimeEvent<{ readonly kind: string }>[] = [];
  const errors: string[] = [];
  const client = createRealtimeClient({ resolveUrl: () => '/main/ws' });
  client.onError((event) => errors.push(event.code));
  expect(sockets).toHaveLength(0);

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
  sockets[0]?.message({
    type: 'error',
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Sign in first.',
  });
  expect(events).toHaveLength(1);
  expect(errors).toEqual(['AUTHENTICATION_REQUIRED']);

  client.reconnect();
  sockets[1]?.open();
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: 'subscribe:notifications:in-app',
    topic: 'notifications:in-app',
  });

  vi.advanceTimersByTime(300_000);
  expect(sentMessages.at(-1)).toEqual({ type: 'ping' });

  unsubscribe();
  expect(sentMessages.at(-1)).toEqual({
    type: 'unsubscribe',
    topic: 'notifications:in-app',
  });
});
