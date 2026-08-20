import type { Hono } from 'hono';

import type { AppWebSocketHandler } from '@nocobase/app-server/websocket';

import type {
  RealtimeConnection,
  RealtimeService,
} from '../realtime/service.js';

export const APP_LOCAL_WEBSOCKET_PATH = '/ws';

export interface WebSocketHandlerOptions {
  realtime: RealtimeService;
}

export function registerWebSocketRoutes(app: Hono): void {
  app.get(APP_LOCAL_WEBSOCKET_PATH, (context) =>
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

export function createWebSocketHandler(options: WebSocketHandlerOptions): AppWebSocketHandler {
  return (request) => {
    const url = new URL(request.url);
    if (url.pathname !== APP_LOCAL_WEBSOCKET_PATH) {
      return null;
    }

    let connection: RealtimeConnection | undefined;
    const disconnect = (): void => {
      if (!connection) {
        return;
      }

      options.realtime.disconnect(connection);
      connection = undefined;
    };

    return {
      onOpen(_event, ws) {
        connection = options.realtime.connect(ws, { request });
      },
      onMessage(event, ws) {
        if (!connection) {
          connection = options.realtime.connect(ws, { request });
        }

        options.realtime.handleClientMessage(connection, event.data);
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
