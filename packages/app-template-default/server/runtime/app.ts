import { Hono } from 'hono';

import type { ConfigPaths } from '@nocobase/app-server-kit/config';
import { createOriginProxyHandler } from '@nocobase/app-server-kit/proxy';
import type { SpaHandler } from '@nocobase/app-server-kit/spa';
import {
  addBasePathToRedirectResponse,
  joinBasePath,
  normalizeBasePath,
} from '@nocobase/app-server-kit/support';

import type { Application } from '@nocobase/app-server-kit/application';
import { createApplication, type AppServer } from '../app.js';
import type { AppConfig } from '../config/index.js';
import { loadPluginProviders, loadPluginRoutes } from '../plugins/index.js';

export interface CreateConfiguredApplicationOptions {
  viteDevUrl?: string | URL | false;
}

interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

export async function createConfiguredApplication(
  config: AppConfig,
  paths: ConfigPaths,
  options: CreateConfiguredApplicationOptions,
): Promise<Application<AppConfig>> {
  const viteDevUrl = resolveViteDevUrlOption(
    options.viteDevUrl,
    config.server.viteDevUrl,
  );

  const [pluginProviders, pluginRoutes] = await Promise.all([
    loadPluginProviders(config.plugins),
    loadPluginRoutes(config.plugins),
  ]);

  const app = createApplication(config, paths, {
    pluginProviders,
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

  return app;
}

export function createPublicBasePathAdapter(
  app: AppServer,
  publicBasePath: string,
): AppServer {
  const basePath = normalizeBasePath(publicBasePath);
  if (!basePath) {
    return app;
  }

  const router = new Hono();

  router.all(basePath, (context) =>
    dispatchMountedApp(app, context.req.raw, basePath),
  );
  router.all(`${basePath}/*`, (context) =>
    dispatchMountedApp(app, context.req.raw, basePath),
  );

  const mounted: AppServer = {
    fetch: router.fetch,
  };
  if (app.websocket) {
    mounted.websocket = (request, env) => {
      const strippedRequest = stripPublicBasePathFromRequest(request, basePath);
      if (!strippedRequest) {
        return null;
      }

      return app.websocket?.(strippedRequest, env) ?? null;
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
