import { Hono } from 'hono';

import { createOriginProxyHandler } from '@nocobase/app-server/proxy';
import type { AppRuntime } from '@nocobase/app-server/runtime';
import type { SpaHandler } from '@nocobase/app-server/spa';
import { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

import { createApp, type ClosableApp } from '../app.js';
import type { AppConfig } from '../config/index.js';

export interface CreateAppFromRuntimeOptions {
  viteDevUrl?: string | URL | false;
}

interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

export function createAppFromRuntime(
  runtime: AppRuntime<AppConfig>,
  options: CreateAppFromRuntimeOptions = {},
): ReturnType<typeof createApp> {
  const { config } = runtime;
  const viteDevUrl = resolveViteDevUrlOption(options.viteDevUrl, config.server.viteDevUrl);

  return createApp({
    appName: config.app.name,
    internalBasePath: config.app.internalBasePath,
    publicBasePath: config.app.publicBasePath,
    internalApiProxyPath: config.app.internalApiProxyPath,
    publicApiUrl: config.app.publicApiUrl,
    cache: config.cache,
    database: runtime.database,
    drive: config.drive,
    logger: config.logger,
    queue: config.queue,
    session: config.session,
    notifications: config.notification,
    nocoBaseApiUrl: config.app.nocoBaseApiUrl,
    spa: {
      handler: viteDevUrl
        ? createPublicBasePathOriginProxyHandler(viteDevUrl, config.app.publicBasePath)
        : undefined,
      indexPath: config.spa.indexPath,
      runtime: config.spa.runtime,
    },
  });
}

export function mountAppAtPublicBasePath(app: ClosableApp, publicBasePath: string): ClosableApp;
export function mountAppAtPublicBasePath(app: Hono, publicBasePath: string): Hono;
export function mountAppAtPublicBasePath(app: Hono, publicBasePath: string): Hono {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return app;
  }

  const mounted = new Hono();

  mounted.all('/healthz', (context) => app.fetch(context.req.raw));
  mounted.all(basePath, (context) => dispatchMountedApp(app, context.req.raw, basePath));
  mounted.all(`${basePath}/*`, (context) => dispatchMountedApp(app, context.req.raw, basePath));

  if (isClosableApp(app)) {
    return Object.assign(mounted, {
      websocketServer: app.websocketServer,
      handleUpgrade: app.handleUpgrade,
      start: () => app.start(),
      close: () => app.close(),
    });
  }

  return mounted;
}

export function stripPublicBasePathFromRequest(request: Request, publicBasePath: string): Request | null {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return request;
  }

  const url = new URL(request.url);
  if (url.pathname === basePath || url.pathname === `${basePath}/`) {
    url.pathname = '/';
    return cloneRequestWithUrl(request, url);
  }

  if (!url.pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  url.pathname = url.pathname.slice(basePath.length) || '/';
  return cloneRequestWithUrl(request, url);
}

function dispatchMountedApp(app: Hono, request: Request, publicBasePath: string): Response | Promise<Response> {
  const strippedRequest = stripPublicBasePathFromRequest(request, publicBasePath);
  if (!strippedRequest) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return app.fetch(strippedRequest);
}

function isClosableApp(app: Hono): app is ClosableApp {
  const candidate = app as Partial<ClosableApp>;
  return typeof candidate.start === 'function' && typeof candidate.close === 'function';
}

function createPublicBasePathOriginProxyHandler(targetOrigin: URL, publicBasePath: string): SpaHandler {
  const proxyToOrigin = createOriginProxyHandler(targetOrigin, {
    unavailableMessage: 'Vite dev server is unavailable.',
  });

  return (request) => proxyToOrigin(addPublicBasePathToRequest(request, publicBasePath));
}

function addPublicBasePathToRequest(request: Request, publicBasePath: string): Request {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return request;
  }

  const url = new URL(request.url);
  url.pathname = joinPublicPath(basePath, url.pathname);
  return cloneRequestWithUrl(request, url);
}

function joinPublicPath(publicBasePath: string, appLocalPath: string): string {
  const basePath = normalizeBasePath(publicBasePath);
  const localPath = normalizeBasePath(appLocalPath);

  if (!basePath) {
    return localPath || '/';
  }

  return localPath ? joinBasePath(basePath, localPath) : `${basePath}/`;
}

function cloneRequestWithUrl(request: Request, url: URL): Request {
  const init: RequestInitWithDuplex = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

function resolveViteDevUrlOption(value: string | URL | false | undefined, defaultValue: URL | undefined): URL | undefined {
  if (value === undefined) {
    return defaultValue;
  }

  if (value === false) {
    return undefined;
  }

  if (value instanceof URL) {
    return value;
  }

  const normalized = value.trim();
  if (!normalized || normalized === 'false' || normalized === '0') {
    return undefined;
  }

  return new URL(normalized);
}
