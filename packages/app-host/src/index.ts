/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { AppRegistryError } from './errors.ts';
import { applyFetchResponse, isClientResponseClose, requestPath, toFetchRequest } from './http-adapter.ts';
import { DirectoryAppCatalog } from './app-catalog.ts';
import { AppRuntimeRegistry } from './app-registry.ts';
import { writeAppSystemLog } from './app-system-log.ts';
import { getPathInsideApp, isAppAssetPath, serveAppAssets } from './static-client.ts';
import { acceptWebSocketUpgrade, isWebSocketUpgrade, rejectWebSocketUpgrade } from './websocket.ts';

export * from './errors.ts';
export * from './events.ts';
export * from './http-adapter.ts';
export * from './in-process-backend.ts';
export * from './app-catalog.ts';
export * from './app-registry.ts';
export * from './app-runtime.ts';
export * from './app-system-log.ts';
export * from './static-client.ts';
export * from './websocket.ts';
export * from './app-types.ts';

export interface AppHostOptions {
  port?: number;
  host?: string;
  appDistDir?: string;
  maxActiveApps?: number;
  idleTtlMs?: number;
  evictionIntervalMs?: number;
}

export interface AppHost {
  readonly appCatalog: DirectoryAppCatalog;
  readonly registry: AppRuntimeRegistry;
  readonly server: Server;
  start(): Promise<void>;
  close(reason?: string): Promise<void>;
}

export function createAppHost(options: AppHostOptions = {}): AppHost {
  const appCatalog = new DirectoryAppCatalog({
    appsDir: options.appDistDir,
  });
  const registry = new AppRuntimeRegistry({
    resolveFactory: (definition) => appCatalog.resolveFactory(definition),
    maxActiveApps: options.maxActiveApps,
    idleTtlMs: options.idleTtlMs,
    evictionIntervalMs: options.evictionIntervalMs,
  });

  const server = createServer(async (req, res) => {
    try {
      const path = requestPath(req);
      const managementResponse = await managementApi(req, path, registry, appCatalog);
      if (managementResponse) {
        await applyFetchResponse(res, managementResponse);
        return;
      }

      const appId = resolveAppId(path, registry);
      if (appId) {
        const definition = registry.definition(appId);

        if (!definition) {
          await applyFetchResponse(res, notFoundResponse());
          return;
        }

        const pathInside = getPathInsideApp(definition, path);

        if (isAppAssetPath(pathInside)) {
          const assetResponse = await serveAppAssets(definition, req, pathInside);
          await applyFetchResponse(res, assetResponse ?? notFoundResponse());
          return;
        }

        const response = definition.server
          ? await dispatchAppServer(req, path, registry, appId)
          : notFoundResponse();
        await applyFetchResponse(res, response);
        return;
      }

      await applyFetchResponse(res, notFoundResponse());
    } catch (error) {
      if (isClientResponseClose(error, res)) {
        return;
      }

      try {
        await handleError(error, res);
      } catch (handleErrorError) {
        if (!isClientResponseClose(handleErrorError, res)) {
          console.error(handleErrorError);
        }

        if (!res.destroyed) {
          res.destroy(handleErrorError instanceof Error ? handleErrorError : new Error(String(handleErrorError)));
        }
      }
    }
  });

  server.on('upgrade', (req, socket, head) => {
    void dispatchAppWebSocket(req, socket, head, registry).catch((error) => {
      console.error(error);
      rejectWebSocketUpgrade(socket, error instanceof AppRegistryError ? error.status : 500);
    });
  });

  return {
    appCatalog,
    registry,
    server,
    async start() {
      const discoveredApps = await appCatalog.registerDiscovered(registry);
      attachAppEventLogs(registry);

      await new Promise<void>((resolve) => {
        server.listen(options.port ?? 3000, options.host ?? '127.0.0.1', resolve);
      });

      const address = server.address();
      const bind = typeof address === 'object' && address ? `${address.address}:${address.port}` : String(address);
      console.log(`App host listening on http://${bind}`);
      console.log(`App dist directory: ${appCatalog.appsDir}`);
      console.log(
        `Discovered ${discoveredApps.length} app(s): ${
          discoveredApps.map((app) => app.id).join(', ') || '(none)'
        }`,
      );
    },
    async close(reason = 'host shutdown') {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ERR_SERVER_NOT_RUNNING') {
          throw error;
        }
      });

      await registry.destroyAll(reason);
    },
  };
}

async function dispatchAppServer(
  req: IncomingMessage,
  path: string,
  registry: AppRuntimeRegistry,
  appId: string,
): Promise<Response> {
  const runtime = await registry.ensureActiveHandle(appId);
  const request = toFetchRequest(req, {
    basePath: runtime.basePath,
    signal: runtime.signal,
  });
  return runtime.dispatch(request, {
    method: req.method,
    path,
  });
}

async function dispatchAppWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  registry: AppRuntimeRegistry,
): Promise<void> {
  if (!isWebSocketUpgrade(req)) {
    rejectWebSocketUpgrade(socket, 400);
    return;
  }

  const path = requestPath(req);
  const appId = resolveAppId(path, registry);
  if (!appId) {
    rejectWebSocketUpgrade(socket, 404);
    return;
  }

  const definition = registry.definition(appId);
  if (!definition?.server) {
    rejectWebSocketUpgrade(socket, 404);
    return;
  }

  const pathInside = getPathInsideApp(definition, path);
  if (isAppAssetPath(pathInside)) {
    rejectWebSocketUpgrade(socket, 404);
    return;
  }

  const runtime = await registry.ensureActiveHandle(appId);
  const request = toFetchRequest(req, {
    basePath: runtime.basePath,
    signal: runtime.signal,
  });
  const result = await runtime.acceptWebSocket(request, {
    method: req.method,
    path,
  });

  if (result instanceof Response) {
    rejectWebSocketUpgrade(socket, result.status, result.headers);
    return;
  }

  if (!result) {
    rejectWebSocketUpgrade(socket, 404);
    return;
  }

  acceptWebSocketUpgrade(req, socket, {
    request,
    events: result,
    head,
    signal: runtime.signal,
  });
}

export async function startAppHostFromEnv(): Promise<AppHost> {
  const host = createAppHost({
    port: numberFromEnv('PORT') ?? numberFromEnv('APP_HOST_PORT') ?? 3000,
    host: process.env.APP_HOST_BIND ?? process.env.HOST ?? '127.0.0.1',
    appDistDir: process.env.APP_DIST_DIR,
    maxActiveApps: numberFromEnv('MAX_ACTIVE_APPS'),
    idleTtlMs: numberFromEnv('APP_IDLE_TTL_MS'),
    evictionIntervalMs: numberFromEnv('APP_EVICTION_INTERVAL_MS'),
  });

  await host.start();
  return host;
}

function attachAppEventLogs(registry: AppRuntimeRegistry): void {
  registry.events.on('app:createFailed', (event) => {
    const definition = registry.definition(event.appId);
    writeAppSystemLog({
      level: 'error',
      msg: 'Embedded App failed to initialize',
      definition,
      error: event.error,
      fields: {
        event: 'app:createFailed',
        version: event.version,
        state: event.state,
        basePath: event.basePath,
      },
    });
    console.error(`[app] failed to create ${event.appId}@v${event.version} at ${event.basePath}`, event.error);
  });

  registry.events.on('app:created', (event) => {
    console.log(`[app] created ${event.appId}@v${event.version} at ${event.basePath}`);
  });

  registry.events.on('app:draining', (event) => {
    console.log(`[app] draining ${event.appId}@v${event.version}; activeRequests=${event.activeRequests}`);
  });

  registry.events.on('app:resourceDisposed', (event) => {
    console.log(`[app] disposed ${event.appId}@v${event.version}: ${event.resourceName}`);
  });

  registry.events.on('app:destroyed', (event) => {
    console.log(`[app] destroyed ${event.appId}@v${event.version}`);
  });
}

async function managementApi(
  req: IncomingMessage,
  path: string,
  registry: AppRuntimeRegistry,
  appCatalog: DirectoryAppCatalog,
): Promise<Response | null> {
  const method = req.method ?? 'GET';

  if (method === 'GET' && path === '/') {
    return jsonResponse({
      message: 'Node HTTP app host with directory-discovered apps',
      packages: {
        appHost: '@nocobase/app-host',
        appDistDir: appCatalog.appsDir,
      },
      examples: [
        'add app-dist/acme/dist/server/embedded.js, then call POST /__apps/rescan',
        'put hashed static files under app-dist/acme/dist/client/assets for /acme/assets/*',
        'curl -X POST http://localhost:3000/__apps/rescan',
        'curl -X POST http://localhost:3000/__apps/acme/activate',
        'curl -X POST http://localhost:3000/__apps/acme/deploy',
        'curl -X POST http://localhost:3000/__apps/evict-idle',
        'curl http://localhost:3000/__apps/acme',
        'curl -X POST http://localhost:3000/__apps/acme/reload',
        'curl http://localhost:3000/acme/healthz',
        'curl -X DELETE http://localhost:3000/__apps/acme',
      ],
    });
  }

  if (method === 'GET' && path === '/__health') {
    return jsonResponse(registry.health());
  }

  if (method === 'GET' && path === '/__apps') {
    return jsonResponse({
      active: registry.list(),
      definitions: registry.listDefinitions(),
    });
  }

  if (path === '/__apps/rescan') {
    if (method !== 'POST') {
      return methodNotAllowed('POST');
    }

    const sync = await appCatalog.syncDiscovered(registry);
    return jsonResponse({
      ...sync,
      active: registry.list(),
      definitions: registry.listDefinitions(),
    });
  }

  if (path === '/__apps/evict-idle') {
    if (method !== 'POST') {
      return methodNotAllowed('POST');
    }

    const evicted = await registry.evictIdle();
    return jsonResponse({ evicted });
  }

  const actionMatch = path.match(/^\/__apps\/([^/]+)\/(activate|deploy|evict|reload)$/);
  if (actionMatch) {
    if (method !== 'POST') {
      return methodNotAllowed('POST');
    }

    const id = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];

    if (action === 'activate') {
      return jsonResponse({
        app: await registry.ensureActive(id),
      });
    }

    if (action === 'deploy') {
      const input = await readJsonBody(req);
      return jsonResponse({
        deployment: await registry.deploy(id, {
          version: typeof input.version === 'string' ? input.version : undefined,
          strategy: input.strategy === 'restart' || input.strategy === 'blue-green' ? input.strategy : undefined,
          destroyTimeoutMs: numberFromValue(input.destroyTimeoutMs),
          waitForReady: typeof input.waitForReady === 'boolean' ? input.waitForReady : undefined,
          reason: 'deploy API',
        }),
      });
    }

    if (action === 'evict') {
      return jsonResponse({
        evicted: await registry.evict(id, { reason: 'evict API' }),
      });
    }

    return jsonResponse({
      app: await registry.reload(id, { reason: 'reload API' }),
    });
  }

  const match = path.match(/^\/__apps\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const id = decodeURIComponent(match[1]);

  if (method === 'GET') {
    return jsonResponse(registry.status(id));
  }

  if (method === 'POST') {
    return jsonResponse(
      {
        error:
          'App creation through API is disabled. Add app-dist/<app>/dist/server/embedded.js and call POST /__apps/rescan.',
      },
      {
        status: 405,
        headers: {
          allow: 'GET, DELETE',
        },
      },
    );
  }

  if (method === 'DELETE') {
    const evicted = await registry.evict(id, { reason: 'delete API' });
    return jsonResponse({ evicted }, { status: evicted ? 200 : 404 });
  }

  return methodNotAllowed('GET, DELETE');
}

function resolveAppId(path: string, registry: AppRuntimeRegistry): string | null {
  const match = parseAppPath(path);
  if (!match) {
    return null;
  }

  for (const id of match.candidates) {
    if (registry.has(id)) {
      return id;
    }
  }

  return match.candidates[0] ?? null;
}

function parseAppPath(path: string): { candidates: string[] } | null {
  const match = path.match(/^\/([^/]+)(?:\/|$)/);
  if (!match) {
    return null;
  }

  const appName = decodeURIComponent(match[1]);
  return {
    candidates: [appName],
  };
}

function notFoundResponse(): Response {
  return jsonResponse(
    {
      error: 'Not found',
      routes: [
        'GET /',
        'GET /__health',
        'GET /__apps',
        'POST /__apps/rescan',
        'POST /__apps/evict-idle',
        'GET /__apps/:id',
        'POST /__apps/:id/activate',
        'POST /__apps/:id/deploy',
        'POST /__apps/:id/evict',
        'POST /__apps/:id/reload',
        'DELETE /__apps/:id',
        'GET /:app',
      ],
    },
    { status: 404 },
  );
}

function methodNotAllowed(allow: string): Response {
  return jsonResponse(
    {
      error: 'Method not allowed',
    },
    {
      status: 405,
      headers: {
        allow,
      },
    },
  );
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }

  const value = JSON.parse(text) as unknown;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function handleError(error: unknown, res: ServerResponse): Promise<void> {
  if (!(error instanceof AppRegistryError) || error.status >= 500) {
    console.error(error);
  }

  if (res.headersSent) {
    res.destroy(error instanceof Error ? error : new Error(String(error)));
    return;
  }

  const response = jsonResponse(
    {
      error: error instanceof Error ? error.message : String(error),
      code: error instanceof AppRegistryError ? error.code : 'INTERNAL_SERVER_ERROR',
    },
    {
      status: error instanceof AppRegistryError ? error.status : 500,
    },
  );

  await applyFetchResponse(res, response);
}

function numberFromValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function numberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
