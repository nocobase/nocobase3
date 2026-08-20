import type { Hono } from 'hono';

import type {
  AppWebSocket,
  AppWebSocketEvents,
  AppWebSocketHandler,
  AppWebSocketMessageData,
} from '@nocobase/app-server/websocket';

import type { PortalLiveSocket } from '../../registry/portal-live/server/index.js';
import type {
  RealtimeConnection,
  RealtimeService,
} from '../realtime/service.js';
import type { PortalLiveService } from '../services/portal-live.js';

export const APP_LOCAL_WEBSOCKET_PATH = '/ws';
export const PORTAL_LIVE_WEBSOCKET_PATH = '/live';

export interface WebSocketHandlerOptions {
  realtime: RealtimeService;
  portalLive?: PortalLiveService;
  sessionCookieName?: string;
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
  app.get(PORTAL_LIVE_WEBSOCKET_PATH, (context) =>
    context.json(
      { error: 'WebSocket upgrade required' },
      { status: 426, headers: { upgrade: 'websocket' } },
    ),
  );
}

export function createWebSocketHandler(options: WebSocketHandlerOptions): AppWebSocketHandler {
  return (request) => {
    const url = new URL(request.url);
    if (url.pathname === PORTAL_LIVE_WEBSOCKET_PATH && options.portalLive) {
      return createPortalLiveWebSocketEvents(
        request,
        options.portalLive,
        options.sessionCookieName,
      );
    }
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

function createPortalLiveWebSocketEvents(
  request: Request,
  portalLive: PortalLiveService,
  sessionCookieName: string | undefined,
): AppWebSocketEvents {
  const messageListeners = new Set<(data: string) => void>();
  const closeListeners = new Set<(code: number, reason: string) => void>();
  const errorListeners = new Set<(error: unknown) => void>();
  const pongListeners = new Set<() => void>();

  return {
    onOpen(_event, ws): void {
      portalLive.createConnection(
        createPortalLiveSocket(ws, messageListeners, closeListeners, errorListeners, pongListeners),
        readCookieValue(request.headers.get('cookie') ?? undefined, sessionCookieName),
      );
    },
    onMessage(event): void {
      const data = decodeMessageData(event.data);
      for (const listener of messageListeners) listener(data);
    },
    onClose(event): void {
      for (const listener of closeListeners) listener(event.code, event.reason);
    },
    onError(event): void {
      for (const listener of errorListeners) listener(event.error);
    },
    onPong(): void {
      for (const listener of pongListeners) listener();
    },
  };
}

function createPortalLiveSocket(
  ws: AppWebSocket,
  messageListeners: Set<(data: string) => void>,
  closeListeners: Set<(code: number, reason: string) => void>,
  errorListeners: Set<(error: unknown) => void>,
  pongListeners: Set<() => void>,
): PortalLiveSocket {
  return {
    send: (data: string): void => ws.send(data),
    close: (code?: number, reason?: string): void => ws.close(code, reason),
    onMessage: (listener: (data: string) => void): (() => void) => registerListener(messageListeners, listener),
    onClose: (listener: (code: number, reason: string) => void): (() => void) => registerListener(closeListeners, listener),
    onError: (listener: (error: unknown) => void): (() => void) => registerListener(errorListeners, listener),
    ping: (): void => ws.ping(),
    onPong: (listener: () => void): (() => void) => registerListener(pongListeners, listener),
  };
}

function registerListener<TListener>(listeners: Set<TListener>, listener: TListener): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

function decodeMessageData(data: AppWebSocketMessageData): string {
  return typeof data === 'string' ? data : new TextDecoder().decode(data);
}

function readCookieValue(header: string | undefined, name: string | undefined): string | undefined {
  if (!header || !name) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}
