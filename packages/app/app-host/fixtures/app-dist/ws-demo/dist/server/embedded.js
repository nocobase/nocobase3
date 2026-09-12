import { readFile } from 'node:fs/promises';
import path from 'node:path';

const APP_LOCAL_WEBSOCKET_PATH = '/ws';

export function createServer(scope) {
  let closed = false;
  const connections = new Set();
  const intervals = new Map();

  const disposeConnection = (ws) => {
    clearInterval(intervals.get(ws));
    intervals.delete(ws);
    connections.delete(ws);
  };

  const dispose = () => {
    if (closed) {
      return;
    }

    closed = true;
    for (const intervalId of intervals.values()) {
      clearInterval(intervalId);
    }
    intervals.clear();
    for (const ws of connections) {
      ws.close(1001, 'ws-demo closed');
    }
    connections.clear();
  };

  scope.registerDisposer('ws-demo', dispose);

  return {
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === '/healthz') {
        return Response.json({
          ok: true,
          id: scope.id,
          basePath: scope.basePath,
          requestPath: url.pathname,
          closed,
        });
      }

      if (url.pathname === '/api/info') {
        return Response.json({
          id: scope.id,
          basePath: scope.basePath,
          assetsBasePath: scope.assetsBasePath,
          requestPath: url.pathname,
          websocket: websocketInfo(scope, request),
        });
      }

      if (url.pathname === APP_LOCAL_WEBSOCKET_PATH) {
        return Response.json(
          {
            error: 'WebSocket upgrade required',
            websocket: websocketInfo(scope, request),
          },
          {
            status: 426,
            headers: {
              upgrade: 'websocket',
            },
          },
        );
      }

      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await readFile(path.join(scope.clientDir, 'index.html'), 'utf8');
        return new Response(rewriteFixtureHtml(html, scope), {
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
    websocket(request) {
      const url = new URL(request.url);

      if (url.pathname !== APP_LOCAL_WEBSOCKET_PATH) {
        return null;
      }

      if (closed) {
        return Response.json(
          {
            error: 'WebSocket demo is closed',
          },
          {
            status: 503,
          },
        );
      }

      return {
        onOpen(_event, ws) {
          connections.add(ws);

          const sendNow = () => {
            if (ws.readyState === 1) {
              ws.send(new Date().toString());
            }
          };
          const intervalId = setInterval(sendNow, 200);
          intervals.set(ws, intervalId);
          sendNow();
        },
        onMessage(event, ws) {
          ws.send(`echo: ${String(event.data)}`);
        },
        onClose(_event, ws) {
          disposeConnection(ws);
        },
        onError(_event, ws) {
          disposeConnection(ws);
        },
      };
    },
  };
}

function websocketInfo(scope, request) {
  const publicPath = `${scope.basePath}${APP_LOCAL_WEBSOCKET_PATH}`;

  return {
    publicUrl: createPublicWebSocketUrl(request, publicPath),
    publicPath,
    appLocalPath: APP_LOCAL_WEBSOCKET_PATH,
    status: 'available',
  };
}

function createPublicWebSocketUrl(request, pathname) {
  const url = new URL(request.url);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = pathname;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function rewriteFixtureHtml(html, scope) {
  return html
    .replace(/\b(src|href)=(["'])\/assets\//g, (_match, attribute, quote) => {
      return `${attribute}=${quote}${scope.assetsBasePath}/`;
    });
}
