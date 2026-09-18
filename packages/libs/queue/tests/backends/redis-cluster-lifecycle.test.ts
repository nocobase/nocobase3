import { createIORedisClient, RedisQueueBackend } from 'bullmq';
import { Cluster, Redis } from 'ioredis';
import { expect, it, vi } from 'vitest';
import { createServiceRedisBackend } from '../../src/backends/redis.js';

function fixture() {
  const clients: Cluster[] = [];
  const nodes = new Map<Cluster, Redis[]>();
  const create = (): Cluster => {
    const client = new Cluster([], { lazyConnect: true });
    client.status = 'ready';
    const children = Array.from({ length: 3 }, () => {
      const node = new Redis({ lazyConnect: true });
      node.status = 'ready';
      return node;
    });
    nodes.set(client, children);
    vi.spyOn(client, 'nodes').mockReturnValue(children);
    vi.spyOn(client, 'info').mockResolvedValue(
      'redis_version:7.0.8\r\nmaxmemory_policy:noeviction\r\n',
    );
    vi.spyOn(client, 'duplicate').mockImplementation(create);
    vi.spyOn(client, 'disconnect').mockImplementation(() => {
      client.status = 'end';
      client.emit('end');
      // A later node drain overwrites the aggregate status without another end.
      client.status = 'close';
    });
    vi.spyOn(client, 'connect').mockImplementation(async () => {
      expect(children.every((node) => node.status === 'end')).toBe(true);
      client.status = 'ready';
      client.emit('ready');
    });
    clients.push(client);
    return client;
  };
  const caller = create();
  const endNodes = (client: Cluster): void => {
    for (const node of nodes.get(client)!) {
      node.status = 'end';
      node.emit('end');
    }
  };
  const backend = createServiceRedisBackend(
    'cluster-end',
    { connection: createIORedisClient(caller) },
    { withBlockingConnection: true },
  );
  backend.on('error', () => {});
  return { caller, clients, backend, endNodes };
}

it('retains every node ending across repeated blocking disconnects and Worker backend close', async () => {
  const { caller, clients, backend, endNodes } = fixture();
  await backend.waitUntilReady();
  const regular = clients[1]!;
  const blocking = clients[2]!;
  try {
    await backend.disconnectBlocking(true);
    if (!(backend instanceof RedisQueueBackend))
      throw new Error('Expected Redis backend');
    expect((await backend.blockingClient)?.status).toBe('end');
    await backend.disconnectBlocking(true);
    expect(blocking.disconnect).toHaveBeenCalledOnce();
    let closed = false;
    const closing = backend.close().then(() => {
      closed = true;
    });
    await vi.waitFor(() => expect(regular.disconnect).toHaveBeenCalled());
    endNodes(regular);
    await Promise.resolve();
    expect(closed).toBe(false);
    endNodes(blocking);
    await closing;
    expect(closed).toBe(true);
    expect(caller.disconnect).not.toHaveBeenCalled();
  } finally {
    endNodes(regular);
    endNodes(blocking);
    await backend.close();
  }
});

it('does not reconnect an interrupted Cluster generation before all its nodes end', async () => {
  const { caller, clients, backend, endNodes } = fixture();
  await backend.waitUntilReady();
  const regular = clients[1]!;
  const blocking = clients[2]!;
  try {
    await backend.disconnectBlocking(true);
    const reconnecting = backend.reconnectBlocking();
    await Promise.resolve();
    await Promise.resolve();
    expect(blocking.connect).not.toHaveBeenCalled();
    endNodes(blocking);
    await reconnecting;
    expect(blocking.connect).toHaveBeenCalledOnce();
    if (!(backend instanceof RedisQueueBackend))
      throw new Error('Expected Redis backend');
    expect((await backend.blockingClient)?.status).toBe('ready');
    expect(caller.connect).not.toHaveBeenCalled();
  } finally {
    const closing = backend.close();
    endNodes(regular);
    endNodes(blocking);
    await closing;
  }
});
