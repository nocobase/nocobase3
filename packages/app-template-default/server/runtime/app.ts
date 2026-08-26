import { Hono } from 'hono';

import { createOriginProxyHandler } from '@nocobase/app-server-kit/proxy';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type { SpaHandler } from '@nocobase/app-server-kit/spa';
import {
  addBasePathToRedirectResponse,
  joinBasePath,
  normalizeBasePath,
} from '@nocobase/app-server-kit/support';

import { createApp, type AppServer } from '../app.js';
import type { AppLifecycle } from '../app-options.js';
import type { AppConfig } from '../config/index.js';
import { loadPluginBootstraps, loadPluginRoutes } from '../plugins/index.js';

export interface CreateAppFromRuntimeOptions {
  lifecycle: AppLifecycle;
  viteDevUrl?: string | URL | false;
}

interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

export async function createAppFromRuntime(
  runtime: AppRuntime<AppConfig>,
  options: CreateAppFromRuntimeOptions,
): Promise<AppServer> {
  const { config } = runtime;
  const viteDevUrl = resolveViteDevUrlOption(
    options.viteDevUrl,
    config.server.viteDevUrl,
  );

  const [pluginBootstraps, pluginRoutes] = await Promise.all([
    loadPluginBootstraps(config.plugins),
    loadPluginRoutes(config.plugins),
  ]);

  return createApp(runtime, {
    lifecycle: options.lifecycle,
    pluginBootstraps,
    pluginRoutes,
    spa: {
      handler: viteDevUrl
        ? createPublicBasePathOriginProxyHandler(
            viteDevUrl,
            config.app.publicBasePath,
          )
        : undefined,
    },
  });
}

export function createPublicBasePathAdapter(
  app: AppServer,
  publicBasePath: string,
): AppServer {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return app;
  }

  const mounted = new Hono() as AppServer;
  mounted.all(basePath, (context) =>
    dispatchMountedApp(app, context.req.raw, basePath),
  );
  mounted.all(`${basePath}/*`, (context) =>
    dispatchMountedApp(app, context.req.raw, basePath),
  );

  const websocket = app.websocket;
  if (websocket) {
    mounted.websocket = (request, env) => {
      const strippedRequest = stripPublicBasePathFromRequest(request, basePath);
      if (!strippedRequest) {
        return null;
      }

      return websocket(strippedRequest, env);
    };
  }

  return mounted;
}

export function stripPublicBasePathFromRequest(
  request: Request,
  publicBasePath: string,
): Request | null {
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

async function dispatchMountedApp(
  app: AppServer,
  request: Request,
  publicBasePath: string,
): Promise<Response> {
  const strippedRequest = stripPublicBasePathFromRequest(
    request,
    publicBasePath,
  );
  if (!strippedRequest) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const response = await app.fetch(strippedRequest);
  return addBasePathToRedirectResponse(response, publicBasePath);
}

function createPublicBasePathOriginProxyHandler(
  targetOrigin: URL,
  publicBasePath: string,
): SpaHandler {
  const proxyToOrigin = createOriginProxyHandler(targetOrigin, {
    unavailableMessage: 'Vite dev server is unavailable.',
  });

  return (request) =>
    proxyToOrigin(
      alignRequestOrigin(
        addPublicBasePathToRequest(request, publicBasePath),
        targetOrigin,
      ),
    );
}

function alignRequestOrigin(request: Request, targetOrigin: URL): Request {
  const headers = new Headers(request.headers);
  const requestOrigin = new URL(request.url).origin;
  for (const name of ['origin', 'referer']) {
    const value = headers.get(name);
    if (!value) continue;

    try {
      const url = new URL(value);
      if (url.origin !== requestOrigin) continue;
      url.protocol = targetOrigin.protocol;
      url.host = targetOrigin.host;
      headers.set(name, name === 'origin' ? url.origin : url.toString());
    } catch {
      // Preserve malformed browser headers so the upstream can reject them.
    }
  }

  return cloneRequestWithUrl(request, new URL(request.url), headers);
}

function addPublicBasePathToRequest(
  request: Request,
  publicBasePath: string,
): Request {
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

function cloneRequestWithUrl(
  request: Request,
  url: URL,
  headers: Headers = request.headers,
): Request {
  const init: RequestInitWithDuplex = {
    method: request.method,
    headers,
    signal: request.signal,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

function resolveViteDevUrlOption(
  value: string | URL | false | undefined,
  defaultValue: URL | undefined,
): URL | undefined {
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
