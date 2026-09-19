// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import {
  acceptWebSocketUpgrade,
  createWebSocketUpgradeRequest,
  rejectWebSocketUpgrade,
} from '@nocobase/app-websocket';
import { WebSocket } from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCustomerWebSocketHandler } from '../server/websocket.js';
import type { Customer, CustomerOperation } from '../server/types.js';
import { createFixture } from './helpers.js';

describe('App-owned customer WebSocket protocol', () => {
  let f: Awaited<ReturnType<typeof createFixture>>;
  let server: Server;
  let base: string;
  const sockets: WebSocket[] = [];
  beforeAll(async () => {
    f = await createFixture();
    const handler = createCustomerWebSocketHandler(f.container);
    server = createServer();
    server.on('upgrade', (request, socket, head) => {
      const upgrade = createWebSocketUpgradeRequest(request);
      void Promise.resolve(handler(upgrade))
        .then((result) => {
          if (!result || result instanceof Response)
            rejectWebSocketUpgrade(socket, result?.status ?? 404);
          else
            acceptWebSocketUpgrade(request, socket, {
              request: upgrade,
              events: result,
              head,
            });
        })
        .catch(() => rejectWebSocketUpgrade(socket, 500));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    for (const ws of sockets) ws.terminate();
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await f?.close();
  });
  async function connect(cookie: string) {
    const ws = new WebSocket(`${base}/audit-example/ws`, {
      headers: { cookie },
    });
    sockets.push(ws);
    await once(ws, 'open');
    return ws;
  }
  async function message(
    ws: WebSocket,
    body: unknown,
  ): Promise<{ data?: Customer; code?: string }> {
    const pending = once(ws, 'message');
    ws.send(JSON.stringify(body));
    const [raw] = await pending;
    return JSON.parse(String(raw)) as { data?: Customer; code?: string };
  }
  it('rejects anonymous and cross-origin upgrades and leaves Realtime to its owner', async () => {
    const handler = createCustomerWebSocketHandler(f.container);
    expect(await handler(new Request('http://localhost/ws'))).toBeNull();
    for (const [headers, expected] of [
      [{}, 401],
      [{ cookie: f.alice.cookie, origin: 'http://attacker.test' }, 403],
    ] as const) {
      const response = await handler(
        new Request('http://localhost/audit-example/ws', { headers }),
      );
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(expected);
    }
    const rejected = new WebSocket(`${base}/audit-example/ws`);
    sockets.push(rejected);
    const status = await new Promise<number>((resolve, reject) => {
      rejected.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode!);
        rejected.terminate();
      });
      rejected.once('error', () => undefined);
      rejected.once('open', () =>
        reject(new Error('Anonymous socket accepted')),
      );
    });
    expect(status).toBe(401);
  });
  it('uses authenticated identity and a fresh message id for each mutation', async () => {
    const created = await f.request('/customers', 'POST', {
      name: 'WS',
      phone: '13800001234',
    });
    const customer = ((await created.json()) as { data: Customer }).data;
    const alice = await connect(f.alice.cookie);
    const bob = await connect(f.bob.cookie);
    const input = {
      id: customer.id,
      version: customer.version,
      name: 'WS edited',
      phone: '13900005678',
    };
    expect((await message(bob, input)).code).toBe('CUSTOMER_ACCESS_DENIED');
    expect(
      (await message(alice, { ...input, actor: { id: f.bob.id } })).code,
    ).toBe('INVALID_CUSTOMER_INPUT');
    const first = await message(alice, input);
    expect(first.data?.version).toBe(customer.version + 1);
    const second = await message(alice, {
      ...input,
      version: first.data!.version,
      phone: '13700007890',
    });
    expect(second.data?.version).toBe(customer.version + 2);
    const response = await f.request(`/operations?targetId=${customer.id}`);
    const history = (
      (await response.json()) as { data: CustomerOperation[] }
    ).data.filter((event) => event.source.type === 'ws');
    expect(history).toHaveLength(2);
    expect(history.every((event) => event.actor.id === f.alice.id)).toBe(true);
    expect(history[0]?.source.connectionId).toBe(
      history[1]?.source.connectionId,
    );
    expect(history[0]?.source.messageId).not.toBe(history[1]?.source.messageId);
    expect(JSON.stringify(history)).not.toMatch(/13900005678|13700007890/);
  });
  it('revalidates an existing connection after its session is revoked', async () => {
    const ws = await connect(f.alice.cookie);
    const response = await f.router.request('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie: f.alice.cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(200);
    const closed = once(ws, 'close');
    ws.send('{}');
    const [code] = await closed;
    expect(code).toBe(1008);
  });
});
