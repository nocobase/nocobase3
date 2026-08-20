import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function createServer(scope) {
  const events = [];
  let closed = false;
  let disposeCount = 0;
  let beforeDestroyCount = 0;

  const heartbeat = setInterval(() => {
    events.push({
      type: 'tick',
      at: new Date().toISOString(),
    });
  }, 15_000);
  heartbeat.unref?.();

  const record = (type, detail) => {
    events.push({
      type,
      detail,
      at: new Date().toISOString(),
    });
    console.log(`[${scope.id}] ${type}${detail ? `: ${detail}` : ''}`);
  };

  const dispose = onceAsync(async () => {
    if (closed) {
      record('dispose:app', 'skip duplicate dispose');
      return;
    }

    closed = true;
    disposeCount += 1;
    record('dispose:app', `run ${disposeCount}`);

    await disposeHeartbeat();
    await disposeJournal();
  });

  const unregisterBeforeDestroy = scope.onBeforeDestroy?.(() => {
    beforeDestroyCount += 1;
    record('onBeforeDestroy', `run ${beforeDestroyCount}`);
  });

  scope.registerDisposer('lifecycle-example', dispose);

  async function disposeHeartbeat() {
    if (heartbeat) {
      clearInterval(heartbeat);
      record('dispose:heartbeat', 'cleared interval');
    }
  }

  async function disposeJournal() {
    record('dispose:journal', 'journal sealed');
  }

  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === '/healthz') {
        return Response.json({
          ok: true,
          id: scope.id,
          basePath: scope.basePath,
        });
      }

      if (url.pathname === '/api/lifecycle') {
        return Response.json({
          id: scope.id,
          basePath: scope.basePath,
          assetsBasePath: scope.assetsBasePath,
          clientDir: scope.clientDir,
          signalAborted: scope.signal.aborted,
          beforeDestroyHookRegistered: typeof unregisterBeforeDestroy === 'function',
          beforeDestroyCount,
          disposeCount,
          closed,
          events,
        });
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(scope.clientDir, 'index.html'), 'utf8');
        return new Response(html.replaceAll('/assets/', `${scope.assetsBasePath}/`), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
        });
      }

      return Response.json(
        {
          error: 'Not found',
          path: url.pathname,
        },
        {
          status: 404,
        },
      );
    },
  };
}

function onceAsync(dispose) {
  let promise;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}
