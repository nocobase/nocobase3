import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import {
  createRealtimeService,
  createRealtimeWebSocketHandler,
  realtimePrincipalResolverToken,
  realtimeServiceToken,
  type RealtimeServerMessage,
} from '../src/realtime/index.js';
import type { AppWebSocket, AppWebSocketReadyState } from '../src/websocket.js';

describe('realtime', () => {
  it('subscribes, publishes, and unsubscribes through a typed topic', () => {
    const realtime = createRealtimeService();
    const topic = realtime.defineTopic<string, 'public'>('test:realtime', {
      audience: 'public',
    });
    const websocket = createTestWebSocket();
    const connection = realtime.connect(websocket);

    realtime.handleClientMessage(
      connection,
      JSON.stringify({ type: 'subscribe', topic: topic.name }),
    );
    topic.publish('tick');
    realtime.handleClientMessage(
      connection,
      JSON.stringify({ type: 'unsubscribe', topic: topic.name }),
    );
    topic.publish('after unsubscribe');

    expect(websocket.messages).toEqual([
      expect.objectContaining({
        type: 'subscribed',
        topic: topic.name,
        subscriptionId: expect.any(String),
      }),
      expect.objectContaining({
        type: 'event',
        topic: topic.name,
        payload: 'tick',
      }),
      expect.objectContaining({ type: 'unsubscribed', topic: topic.name }),
    ]);
    topic.close();
    realtime.close();
  });

  it('isolates user topics by authenticated principal', () => {
    const realtime = createRealtimeService();
    const topic = realtime.defineTopic<
      { readonly kind: 'inbox.changed' },
      'user'
    >('test:user', { audience: 'user' });
    const first = createTestWebSocket();
    const second = createTestWebSocket();
    const anonymous = createTestWebSocket();
    const connections = [
      realtime.connect(first, { principal: { userId: 'user-1' } }),
      realtime.connect(second, { principal: { userId: 'user-2' } }),
      realtime.connect(anonymous),
    ];

    for (const connection of connections) {
      realtime.handleClientMessage(
        connection,
        JSON.stringify({ type: 'subscribe', topic: topic.name }),
      );
    }
    topic.publishFor('user-1', { kind: 'inbox.changed' });

    expect(first.messages.at(-1)).toMatchObject({ type: 'event' });
    expect(second.messages).toHaveLength(1);
    expect(anonymous.messages).toEqual([
      expect.objectContaining({
        type: 'error',
        code: 'AUTHENTICATION_REQUIRED',
      }),
    ]);
    topic.close();
    realtime.close();
  });

  it('checks browser origins and resolves a principal before accepting a connection', async () => {
    const realtime = createRealtimeService();
    const resolve = vi.fn(async () => ({ userId: 'user-1' }));
    const container = new ServiceContainer();
    container.instance(realtimeServiceToken, realtime);
    container.instance(realtimePrincipalResolverToken, { resolve });
    const handler = createRealtimeWebSocketHandler(container);

    const acceptedBrowser = await handler(
      new Request('http://localhost/ws', {
        headers: { origin: 'http://localhost' },
      }),
    );
    const acceptedNonBrowser = await handler(
      new Request('http://localhost/ws'),
    );
    const forbidden = await handler(
      new Request('http://localhost/ws', {
        headers: { origin: 'https://untrusted.example' },
      }),
    );
    const websocket = createTestWebSocket();
    if (acceptedBrowser && !(acceptedBrowser instanceof Response)) {
      await acceptedBrowser.onOpen?.({ type: 'open' }, websocket);
    }

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(acceptedBrowser).toMatchObject({ onMessage: expect.any(Function) });
    expect(acceptedNonBrowser).toMatchObject({
      onMessage: expect.any(Function),
    });
    expect(forbidden).toBeInstanceOf(Response);
    expect((forbidden as Response).status).toBe(403);
    realtime.close();
  });
});

interface TestWebSocket extends AppWebSocket {
  readonly messages: RealtimeServerMessage[];
}

function createTestWebSocket(): TestWebSocket {
  let readyState: AppWebSocketReadyState = 1;
  const messages: RealtimeServerMessage[] = [];

  return {
    url: new URL('ws://localhost/ws'),
    protocol: null,
    messages,
    get readyState(): AppWebSocketReadyState {
      return readyState;
    },
    send(data): void {
      messages.push(JSON.parse(String(data)) as RealtimeServerMessage);
    },
    close(): void {
      readyState = 3;
    },
  };
}
