import { once } from 'node:events';
import { connect, createServer } from 'node:net';
import { expect, it } from 'vitest';
import { createTcpProxy } from './helpers/tcp-proxy.js';

it('forwards, blackholes and destroys real test-owned TCP transports', async () => {
  const server = createServer((socket) => socket.pipe(socket));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing echo port');
  const proxy = await createTcpProxy(address.port);
  const client = connect(proxy.port, '127.0.0.1');
  client.on('error', () => {});
  try {
    await once(client, 'connect');
    const response = once(client, 'data');
    client.write('ready');
    expect(String((await response)[0])).toBe('ready');
    proxy.blackhole(true);
    let received = false;
    client.once('data', () => {
      received = true;
    });
    client.write('dropped');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(received).toBe(false);
    const ended = once(client, 'close');
    await proxy.close();
    await ended;
    expect(proxy.sockets.size).toBe(0);
    await proxy.close();
  } finally {
    client.destroy();
    await proxy.close();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
