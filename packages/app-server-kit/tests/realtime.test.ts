import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createRealtimeServer,
  createRealtimeService,
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
      JSON.stringify({
        type: 'subscribe',
        id: 'subscribe-test-topic',
        topic: topic.name,
      }),
    );
    const subscribed = websocket.messages[0];

    expect(subscribed).toMatchObject({
      type: 'subscribed',
      id: 'subscribe-test-topic',
      topic: topic.name,
      subscriptionId: expect.any(String),
    });

    topic.publish('tick');
    expect(websocket.messages[1]).toMatchObject({
      type: 'event',
      topic: topic.name,
      payload: 'tick',
      publishedAt: expect.any(String),
    });

    realtime.handleClientMessage(
      connection,
      JSON.stringify({ type: 'unsubscribe', topic: topic.name }),
    );
    topic.publish('after unsubscribe');

    expect(websocket.messages[2]).toMatchObject({
      type: 'unsubscribed',
      topic: topic.name,
    });
    expect(websocket.messages).toHaveLength(3);
    topic.close();
    realtime.close();
  });

  it('isolates user topics by the authenticated principal', () => {
    const realtime = createRealtimeService();
    const topic = realtime.defineTopic<
      { readonly kind: 'inbox.changed' },
      'user'
    >('test:user', { audience: 'user' });
    const first = createTestWebSocket();
    const second = createTestWebSocket();
    const anonymous = createTestWebSocket();
    const firstConnection = realtime.connect(first, {
      principal: { userId: 'user-1' },
    });
    const secondConnection = realtime.connect(second, {
      principal: { userId: 'user-2' },
    });
    const anonymousConnection = realtime.connect(anonymous);

    for (const connection of [
      firstConnection,
      secondConnection,
      anonymousConnection,
    ]) {
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

  it('owns the HTTP fallback, origin check, and principal resolution', async () => {
    const resolvePrincipal = vi.fn(async () => ({ userId: 'user-1' }));
    const realtime = createRealtimeServer({ resolvePrincipal });
    const app = new Hono();
    realtime.registerHttpRoute(app);

    const response = await app.request('http://localhost/ws');
    const accepted = await realtime.websocket(
      new Request('http://localhost/ws'),
    );
    const forbidden = await realtime.websocket(
      new Request('http://localhost/ws', {
        headers: { origin: 'https://untrusted.example' },
      }),
    );

    expect(response.status).toBe(426);
    expect(accepted).toMatchObject({ onMessage: expect.any(Function) });
    expect(resolvePrincipal).toHaveBeenCalledOnce();
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
    get readyState() {
      return readyState;
    },
    send(data) {
      messages.push(JSON.parse(String(data)) as RealtimeServerMessage);
    },
    close() {
      readyState = 3;
    },
  };
}
