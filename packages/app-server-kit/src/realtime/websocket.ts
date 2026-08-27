import type { Hono } from 'hono';

import type { AppWebSocketHandler } from '../websocket.js';

import type {
  RealtimeConnection,
  RealtimePrincipal,
  RealtimeService,
  RealtimeServiceOptions,
} from './service.js';
import { createRealtimeService } from './service.js';

export const DEFAULT_REALTIME_PATH: string = '/ws';

export interface RealtimeWebSocketOptions {
  readonly path?: string;
  readonly realtime: RealtimeService;
  readonly resolvePrincipal?: (
    request: Request,
  ) => Promise<RealtimePrincipal | undefined>;
}

export interface RealtimeServerOptions
  extends Omit<RealtimeWebSocketOptions, 'realtime'>, RealtimeServiceOptions {}

export interface RealtimeServer {
  readonly service: RealtimeService;
  readonly websocket: AppWebSocketHandler;
  registerHttpRoute(app: Hono): void;
  close(): void;
}

export function createRealtimeServer(
  options: RealtimeServerOptions = {},
): RealtimeServer {
  const service = createRealtimeService(options);
  const path = options.path ?? DEFAULT_REALTIME_PATH;

  return {
    service,
    websocket: createRealtimeWebSocketHandler({
      path,
      realtime: service,
      resolvePrincipal: options.resolvePrincipal,
    }),
    registerHttpRoute(app) {
      registerRealtimeHttpRoute(app, path);
    },
    close() {
      service.close();
    },
  };
}

export function registerRealtimeHttpRoute(
  app: Hono,
  path: string = DEFAULT_REALTIME_PATH,
): void {
  app.get(path, (context) =>
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
  options: RealtimeWebSocketOptions,
): AppWebSocketHandler {
  const path = options.path ?? DEFAULT_REALTIME_PATH;
  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== path) {
      return null;
    }

    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) {
      return Response.json(
        { error: 'WebSocket origin is not allowed.' },
        { status: 403 },
      );
    }

    const principal = await options.resolvePrincipal?.(request);

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
        connection = options.realtime.connect(ws, { request, principal });
      },
      onMessage(event, ws) {
        if (!connection) {
          connection = options.realtime.connect(ws, { request, principal });
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
