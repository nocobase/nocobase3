import type { Hono } from 'hono';

import type { ServiceResolver } from '@nocobase/service-provider';
import type { AppWebSocketHandler } from '../websocket.js';
import {
  realtimePrincipalResolverToken,
  realtimeServiceToken,
  type RealtimeConnection,
} from './types.js';

export const REALTIME_WEBSOCKET_PATH: string = '/ws';

export function registerRealtimeWebSocketRoutes(router: Hono): void {
  router.get(REALTIME_WEBSOCKET_PATH, (context) =>
    context.json(
      {
        error: 'WebSocket upgrade required',
      },
      {
        status: 426,
        headers: {
          upgrade: 'websocket',
        },
      },
    ),
  );
}

export function createRealtimeWebSocketHandler(
  container: ServiceResolver,
): AppWebSocketHandler {
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== REALTIME_WEBSOCKET_PATH) {
      return null;
    }

    const origin = request.headers.get('origin');
    // Browsers always send Origin on WebSocket handshakes and must be
    // same-origin. Origin-less handshakes remain available to non-browser
    // clients, which must provide credentials explicitly.
    if (origin && origin !== url.origin) {
      return Response.json(
        { error: 'WebSocket origin is not allowed.' },
        { status: 403 },
      );
    }

    const realtime = container.resolve(realtimeServiceToken);
    const principal = container.has(realtimePrincipalResolverToken)
      ? await container.resolve(realtimePrincipalResolverToken).resolve(request)
      : undefined;
    let connection: RealtimeConnection | undefined;
    const disconnect = (): void => {
      if (!connection) {
        return;
      }

      realtime.disconnect(connection);
      connection = undefined;
    };

    return {
      onOpen(_event, ws) {
        connection = realtime.connect(ws, { request, principal });
      },
      onMessage(event, ws) {
        if (!connection) {
          connection = realtime.connect(ws, { request, principal });
        }

        realtime.handleClientMessage(connection, event.data);
      },
      onClose() {
        disconnect();
      },
      onError() {
        disconnect();
      },
    };
  };
}
