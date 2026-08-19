// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  createMemoryPortalLivePublisher,
  createPortalLiveConnection,
  type PortalLiveSocket,
} from '../../registry/portal-live/server/index.ts';

class FakeSocket implements PortalLiveSocket {
  messages: string[] = [];
  closed: { code: number; reason: string } | undefined;
  pings = 0;
  private messageListeners = new Set<(data: string) => void>();
  private closeListeners = new Set<(code: number, reason: string) => void>();
  private pongListeners = new Set<() => void>();
  private errorListeners = new Set<(error: unknown) => void>();

  send(data: string): void {
    this.messages.push(data);
  }

  close(code = 1000, reason = 'closed'): void {
    this.closed = { code, reason };
    for (const listener of [...this.closeListeners]) listener(code, reason);
  }

  onMessage(listener: (data: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onClose(listener: (code: number, reason: string) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onError(listener: (error: unknown) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  ping(): void {
    this.pings += 1;
  }

  onPong(listener: () => void): () => void {
    this.pongListeners.add(listener);
    return () => this.pongListeners.delete(listener);
  }

  emitMessage(data: string): void {
    for (const listener of [...this.messageListeners]) listener(data);
  }

  emitPong(): void {
    for (const listener of [...this.pongListeners]) listener();
  }
}

function parseFrames(socket: FakeSocket): Array<Record<string, unknown>> {
  return socket.messages.map((message) => JSON.parse(message) as Record<string, unknown>);
}

function eventFrames(socket: FakeSocket): Array<Record<string, unknown>> {
  return parseFrames(socket).filter((frame) => frame.type === 'event');
}

function createConnection(
  socket: FakeSocket,
  options: {
    authenticator?: { authenticate(token?: string): Promise<{ appId: string; userId: string } | undefined> };
    maxEvents?: number;
    heartbeatIntervalMs?: number;
    missedPongLimit?: number;
    authTimeoutMs?: number;
  } = {},
) {
  const publisher = createMemoryPortalLivePublisher({ maxEvents: options.maxEvents ?? 100 });
  return {
    publisher,
    connection: createPortalLiveConnection({
      socket,
      publisher,
      authenticator: options.authenticator ?? {
        authenticate: async () => ({ appId: 'main', userId: 'user-1' }),
      },
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 10_000,
      missedPongLimit: options.missedPongLimit ?? 2,
      authTimeoutMs: options.authTimeoutMs ?? 5_000,
    }),
  };
}

describe('Portal Live connection protocol', () => {
  it('binds principal from cookie pre-auth and sends auth_ok', async () => {
    const socket = new FakeSocket();
    const { connection } = createConnection(socket, {
      authenticator: {
        authenticate: async (token) => (token === undefined ? { appId: 'main', userId: 'cookie-user' } : undefined),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(connection.principal).toEqual({ appId: 'main', userId: 'cookie-user' });
    expect(parseFrames(socket)).toEqual([
      { version: 1, type: 'auth_ok', streamId: 'main:cookie-user' },
    ]);
  });

  it('accepts bearer token auth frame when cookie pre-auth is absent', async () => {
    const socket = new FakeSocket();
    createConnection(socket, {
      authenticator: {
        authenticate: async (token) => (token === 'secret' ? { appId: 'main', userId: 'token-user' } : undefined),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage(JSON.stringify({ version: 1, type: 'auth', token: 'secret' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parseFrames(socket).some((frame) => frame.type === 'auth_ok' && frame.streamId === 'main:token-user')).toBe(true);
  });

  it('rejects duplicate auth with close 4001', async () => {
    const socket = new FakeSocket();
    createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage(JSON.stringify({ version: 1, type: 'auth', token: 'x' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(socket.closed?.code).toBe(4001);
    expect(parseFrames(socket).some((frame) => frame.type === 'error' && frame.code === 'AUTH_ALREADY_COMPLETED')).toBe(true);
  });

  it('closes with 4002 when authentication times out', async () => {
    const socket = new FakeSocket();
    createConnection(socket, {
      authenticator: { authenticate: () => new Promise(() => undefined) },
      authTimeoutMs: 20,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(socket.closed?.code).toBe(4002);
  });

  it('closes with 4003 after missed pong limit and recovers on pong', async () => {
    const socket = new FakeSocket();
    createConnection(socket, { heartbeatIntervalMs: 20, missedPongLimit: 2 });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(socket.pings).toBeGreaterThan(0);
    socket.emitPong();
    await new Promise((resolve) => setTimeout(resolve, 70));
    expect(socket.closed?.code).toBe(4003);
  });

  it('routes published events to matching subscriptions with type filtering', async () => {
    const socket = new FakeSocket();
    const { publisher } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage(
      JSON.stringify({
        version: 1,
        type: 'subscribe',
        subscriptionId: 's1',
        channel: 'notifications/inbox',
        types: ['created'],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'created', payload: { ids: ['n1'] } });
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'updated', payload: { ids: ['n2'] } });
    publisher.publish({ appId: 'main', userId: 'other-user', channel: 'notifications/inbox', type: 'created', payload: { ids: ['n3'] } });
    const events = eventFrames(socket);
    expect(events).toHaveLength(1);
    expect(events[0].subscriptionId).toBe('s1');
    expect((events[0].event as { payload: { ids: readonly string[] } }).payload.ids).toEqual(['n1']);
  });

  it('replays buffered events on subscribe with cursor', async () => {
    const socket = new FakeSocket();
    const { publisher } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'created', payload: { ids: ['n1'] } });
    const { cursor } = publisher.replay('main', 'user-1');
    socket.emitMessage(
      JSON.stringify({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox', cursor: { streamId: cursor.streamId, sequence: 0 } }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const events = eventFrames(socket);
    expect(events).toHaveLength(1);
    expect((events[0].event as { payload: { ids: readonly string[] } }).payload.ids).toEqual(['n1']);
  });

  it('replays nothing for a fresh subscriber without cursor', async () => {
    const socket = new FakeSocket();
    const { publisher } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'created', payload: { ids: ['n1'] } });
    socket.emitMessage(
      JSON.stringify({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox' }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(eventFrames(socket)).toHaveLength(0);
  });

  it('requests resync when cursor is ahead or from another stream', async () => {
    const socket = new FakeSocket();
    const { publisher } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage(
      JSON.stringify({
        version: 1,
        type: 'subscribe',
        subscriptionId: 's1',
        channel: 'notifications/inbox',
        cursor: { streamId: 'unknown-stream', sequence: 1 },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const frames = parseFrames(socket);
    const resync = frames.find((frame) => frame.type === 'resync_required');
    expect(resync).toBeDefined();
    expect(typeof (resync as { sequence: number }).sequence).toBe('number');
  });

  it('closes with 4000 on invalid frame', async () => {
    const socket = new FakeSocket();
    createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage('not json');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(socket.closed?.code).toBe(4000);
    expect(parseFrames(socket).some((frame) => frame.type === 'error' && frame.code === 'INVALID_FRAME')).toBe(true);
  });

  it('unsubscribes stop event delivery', async () => {
    const socket = new FakeSocket();
    const { publisher } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage(JSON.stringify({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    socket.emitMessage(JSON.stringify({ version: 1, type: 'unsubscribe', subscriptionId: 's1' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    publisher.publish({ appId: 'main', userId: 'user-1', channel: 'notifications/inbox', type: 'created', payload: { ids: ['n1'] } });
    expect(eventFrames(socket)).toHaveLength(0);
  });

  it('sends server_draining and closes with 1001 on drain', async () => {
    const socket = new FakeSocket();
    const { connection } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    connection.drain();
    expect(socket.closed?.code).toBe(1001);
    expect(parseFrames(socket).some((frame) => frame.type === 'server_draining')).toBe(true);
    expect(connection.closed).toBe(true);
  });

  it('ignores messages after close', async () => {
    const socket = new FakeSocket();
    const { connection } = createConnection(socket);
    await new Promise((resolve) => setTimeout(resolve, 0));
    connection.close(1000, 'bye');
    socket.emitMessage(JSON.stringify({ version: 1, type: 'subscribe', subscriptionId: 's1', channel: 'notifications/inbox' }));
    expect(eventFrames(socket)).toHaveLength(0);
  });
});
