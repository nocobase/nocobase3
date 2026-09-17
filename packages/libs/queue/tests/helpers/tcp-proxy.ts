import { createServer, connect } from 'node:net';
import type { Socket } from 'node:net';

export interface TcpProxy {
  port: number;
  sockets: ReadonlySet<Socket>;
  blackhole(enabled: boolean): void;
  disconnect(): void;
  close(): Promise<void>;
}

/** Test-owned transport fault injection; never intercepts a business connection. */
export async function createTcpProxy(targetPort: number): Promise<TcpProxy> {
  let dropped = false;
  const sockets = new Set<Socket>();
  const endings = new Set<Promise<void>>();
  const server = createServer((down) => {
    const up = connect(targetPort, '127.0.0.1');
    for (const socket of [down, up]) {
      sockets.add(socket);
      const ended = new Promise<void>((resolve) =>
        socket.once('close', resolve),
      );
      endings.add(ended);
      void ended.then(() => {
        sockets.delete(socket);
        endings.delete(ended);
      });
      socket.on('error', () => {});
    }
    down.on('data', (data) => {
      if (!dropped) up.write(data);
    });
    up.on('data', (data) => {
      if (!dropped) down.write(data);
    });
    down.on('close', () => up.destroy());
    up.on('close', () => down.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing proxy port');
  let closing: Promise<void> | undefined;
  return {
    port: address.port,
    sockets,
    blackhole(enabled) {
      dropped = enabled;
    },
    disconnect() {
      for (const socket of sockets) socket.destroy();
    },
    close() {
      closing ??= (async () => {
        const stopped = new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
        for (const socket of sockets) socket.destroy();
        await stopped;
        await Promise.all(endings);
      })();
      return closing;
    },
  };
}
