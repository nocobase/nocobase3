import { Server } from 'node:http';
import type { Application } from '@nocobase/app-server/application';
import { closeNodeServer, startNodeAppServer } from '@nocobase/app-server/node';
import { gate } from './system-fixture.js';

import { runCouplingCleanup } from './system-teardown.js';

export interface CouplingHttpServer {
  url: string;
  disconnected: Promise<void>;
  aborted: Promise<void>;
  completed: Promise<number>;
  close(): Promise<void>;
}

/** Observe the production Node transport without replacing its Request or signal. */
export async function serveCouplingApp(
  app: Application,
): Promise<CouplingHttpServer> {
  const disconnected = gate();
  const aborted = gate();
  let resolveCompleted!: (status: number) => void;
  let rejectCompleted!: (error: unknown) => void;
  const completed = new Promise<number>((resolve, reject) => {
    resolveCompleted = resolve;
    rejectCompleted = reject;
  });
  // The original rejecting promise remains observable through completed.
  void completed.catch(() => undefined);
  const active = new Set<Promise<Response>>();
  const server = await startNodeAppServer(
    {
      websocket: app.websocket,
      close: () => app.shutdown(),
      fetch: (request, env, context) => {
        if (request.signal.aborted) aborted.release();
        else
          request.signal.addEventListener('abort', aborted.release, {
            once: true,
          });
        const dispatch = Promise.resolve(app.fetch(request, env, context));
        active.add(dispatch);
        void dispatch.then(
          (response) => {
            active.delete(dispatch);
            resolveCompleted(response.status);
          },
          (error: unknown) => {
            active.delete(dispatch);
            rejectCompleted(error);
          },
        );
        return dispatch;
      },
    },
    { hostname: '127.0.0.1', port: 0, registerProcessSignals: false },
  );
  if (!(server instanceof Server)) {
    await closeNodeServer(server);
    throw new Error('Expected the production HTTP/1 transport.');
  }
  server.on('request', (_incoming, outgoing) => {
    outgoing.on('close', () => {
      if (!outgoing.writableFinished) disconnected.release();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected loopback TCP address.');
  return {
    url: 'http://127.0.0.1:' + address.port,
    disconnected: disconnected.promise,
    aborted: aborted.promise,
    completed,
    async close() {
      const closed = closeNodeServer(server);
      server.closeAllConnections();
      await runCouplingCleanup([
        { name: 'HTTP dispatch drain', run: () => Promise.all([...active]) },
        { name: 'HTTP socket close', run: () => closed },
      ]);
    },
  };
}
