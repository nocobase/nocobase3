import type { Hono } from 'hono';

import type { ServiceResolver } from '@nocobase/service-provider';
import type { AppWebSocketHandler } from '../websocket.js';
import { realtimeServiceToken, type RealtimeConnection } from './types.js';

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
  return (request) => {
    const url = new URL(request.url);
    if (url.pathname !== REALTIME_WEBSOCKET_PATH) {
      return null;
    }

    const realtime = container.resolve(realtimeServiceToken);
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
        connection = realtime.connect(ws, { request });
      },
      onMessage(event, ws) {
        if (!connection) {
          connection = realtime.connect(ws, { request });
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
