import { Hono } from 'hono';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { upgradeWebSocket } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import type { CreateAppOptions } from './app-options.js';
import { registerNocoBaseApiProxyRoutes, resolveNocoBaseApiUrl } from '@nocobase/app-server/proxy';
import { registerSpaRoutes } from '@nocobase/app-server/spa';
import {
  joinBasePath,
  normalizeBasePath,
  resolveAppName,
  resolveAppNameFromBasePath,
} from '@nocobase/app-server/support';
import { createSessionMiddleware } from '@nocobase/session';
import {
  adaptPortalLiveSocket,
  type PortalLiveRawSocket,
} from '../registry/portal-live/server/index.js';
import { createApiRoutes } from './routes/api/index.js';
import { createAppServices } from './services/index.js';
import { createPortalSpaRuntimeGlobals } from './spa/runtime-globals.js';

export type { CreateAppNotificationsOptions, CreateAppOptions, SpaHandler } from './app-options.js';
export { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

export interface ClosableApp extends Hono {
  start(): Promise<void>;
  close(): Promise<void>;
  readonly websocketServer: WebSocketServer;
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
}

export function createApp(options: CreateAppOptions = {}): ClosableApp {
  const publicBasePath = normalizeBasePath(options.publicBasePath ?? '/app-template-default');
  const internalBasePath = normalizeBasePath(options.internalBasePath ?? '');
  const appName = resolveAppName(options.appName ?? resolveAppNameFromBasePath(publicBasePath, 'app-template-default'));
  const internalApiProxyPath = normalizeBasePath(options.internalApiProxyPath ?? '/v2/api');
  const publicApiUrl = options.publicApiUrl ?? joinBasePath(publicBasePath, internalApiProxyPath);
  const nocoBaseApiUrl = resolveNocoBaseApiUrl(options.nocoBaseApiUrl);
  const spaIndexPath = options.spa?.indexPath ?? path.resolve(process.cwd(), 'index.html');
  const spaRuntime = options.spa?.runtime ?? {};
  const services = createAppServices({
    appId: appName,
    cache: options.cache,
    database: options.database,
    drive: options.drive,
    logger: options.logger,
    queue: options.queue,
    session: options.session,
    notifications: options.notifications,
    notificationTemplates: options.notificationTemplates,
  });
  const app = new Hono();
  const websocketServer = new WebSocketServer({ noServer: true });

  app.use('*', createSessionMiddleware(services.sessionManager));

  app.get('/healthz', (c) => {
    return c.json({
      ok: true,
      app: {
        name: appName,
        basePath: publicBasePath,
      },
    });
  });

  registerNocoBaseApiProxyRoutes(app, {
    apiProxyPath: internalApiProxyPath,
    nocoBaseApiUrl,
  });

  app.route(
    joinBasePath(internalBasePath, '/api'),
    createApiRoutes({
      appName,
      publicBasePath,
      services,
    }),
  );

  if (services.notificationModule) {
    app.route(joinBasePath(internalBasePath, '/api/notifications'), services.notificationModule.router);
  }

  if (services.portalLive) {
    app.get('/live', upgradeWebSocket((context) => ({
      onOpen: (_event, socket) => {
        services.portalLive?.createConnection(
          adaptPortalLiveSocket(socket.raw as unknown as PortalLiveRawSocket),
          readCookieValue(context.req.header('cookie'), services.sessionManager.config.cookie.name),
        );
      },
    })));
  }

  registerSpaRoutes(app, {
    basePath: internalBasePath,
    handler: options.spa?.handler,
    indexPath: spaIndexPath,
    runtimeGlobals: createPortalSpaRuntimeGlobals({
      appBasePath: publicBasePath,
      apiUrl: publicApiUrl,
      storagePrefix: spaRuntime.storagePrefix,
      storageType: spaRuntime.storageType,
      shareToken: spaRuntime.shareToken,
    }),
  });

  const handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    const localPath = stripPublicBasePath(pathname, publicBasePath);
    if (localPath !== '/live' || !services.portalLive) {
      socket.destroy();
      return;
    }
    websocketServer.handleUpgrade(request, socket, head, (ws) => {
      services.portalLive?.createConnection(
        adaptPortalLiveSocket(ws),
        readCookieValue(request.headers.cookie, services.sessionManager.config.cookie.name),
      );
    });
  };

  return Object.assign(app, {
    websocketServer,
    handleUpgrade,
    start: onceAsync(() => services.start()),
    close: onceAsync(async () => {
      await services.dispose();
      for (const client of websocketServer.clients) {
        client.terminate();
      }
      websocketServer.close();
    }),
  });
}

function stripPublicBasePath(pathname: string, publicBasePath: string): string {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return pathname;
  }
  if (pathname === basePath) {
    return '/';
  }
  if (pathname.startsWith(`${basePath}/`)) {
    return pathname.slice(basePath.length) || '/';
  }
  return pathname;
}

function readCookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function onceAsync(dispose: () => void | Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}
