import { createServer } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';

import {
  acceptWebSocketUpgrade,
  createWebSocketUpgradeRequest,
  rejectWebSocketUpgrade,
} from '../src/index.ts';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

it('adapts a Node upgrade to the application WebSocket contract', async () => {
  const server = createServer();
  servers.push(server);
  server.on('upgrade', (incoming, socket, head) => {
    if (incoming.url !== '/ws') {
      rejectWebSocketUpgrade(socket, 404);
      return;
    }

    const request = createWebSocketUpgradeRequest(incoming);
    acceptWebSocketUpgrade(incoming, socket, {
      request,
      head,
      events: {
        onMessage(event, websocket) {
          websocket.send(`echo:${String(event.data)}`);
        },
      },
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('WebSocket test server did not expose a TCP address');
  }

  const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await new Promise<void>((resolve, reject) => {
    client.once('open', () => resolve());
    client.once('error', reject);
  });

  const message = new Promise<string>((resolve, reject) => {
    client.once('message', (data) => resolve(data.toString()));
    client.once('error', reject);
  });
  client.send('hello');
  await expect(message).resolves.toBe('echo:hello');
  client.close();
  await new Promise<void>((resolve) => client.once('close', () => resolve()));
});
