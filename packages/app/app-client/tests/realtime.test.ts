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
  const subscribed = vi.fn();
  const listenerError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const client = createRealtimeClient({ resolveUrl: () => '/main/ws' });
  client.onSubscribed('notifications:in-app', subscribed);
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
  const firstSubscriptionRequest = sentMessages.at(-1);
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: expect.any(String),
    topic: 'notifications:in-app',
  });
  expect(subscribed).not.toHaveBeenCalled();

  sockets[0]?.message({
    type: 'subscribed',
    id: firstSubscriptionRequest?.id,
    topic: 'notifications:in-app',
    subscriptionId: 'subscription-1',
  });
  expect(subscribed).toHaveBeenCalledOnce();

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
  const secondSubscriptionRequest = sentMessages.at(-1);
  expect(sentMessages.at(-1)).toEqual({
    type: 'subscribe',
    id: expect.any(String),
    topic: 'notifications:in-app',
  });
  expect(secondSubscriptionRequest?.id).not.toBe(firstSubscriptionRequest?.id);
  expect(subscribed).toHaveBeenCalledOnce();
  sockets[1]?.message({
    type: 'subscribed',
    id: secondSubscriptionRequest?.id,
    topic: 'notifications:in-app',
    subscriptionId: 'subscription-2',
  });
  expect(subscribed).toHaveBeenCalledTimes(2);

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
  const replacementSubscriptionRequest = sentMessages.at(-1);
  sockets[1]?.message({
    type: 'subscribed',
    id: secondSubscriptionRequest?.id,
    topic: 'notifications:in-app',
    subscriptionId: 'stale-subscription',
  });
  expect(subscribed).toHaveBeenCalledTimes(2);
  sockets[1]?.message({
    type: 'subscribed',
    id: replacementSubscriptionRequest?.id,
    topic: 'notifications:in-app',
    subscriptionId: 'replacement-subscription',
  });
  expect(subscribed).toHaveBeenCalledTimes(3);

  unsubscribeReplacement();
  unsubscribeOther();
});
