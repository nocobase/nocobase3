/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';
import {
  AppLifecycleTransitionError,
  AppRegistryError,
  AppReleaseIntegrityError,
  AppStoppedError,
} from './errors.ts';
import {
  applyFetchResponse,
  isClientResponseClose,
  requestPath,
  toFetchRequest,
} from './http-adapter.ts';
import { DirectoryAppCatalog } from './app-catalog.ts';
import {
  AppReleaseStateStore,
  type ActiveReleaseRecord,
} from './app-release-state.ts';
import { AppRuntimeRegistry } from './app-registry.ts';
import { AppLifecycleManager } from './app-lifecycle.ts';
import { AppLifecycleStateStore } from './app-lifecycle-state.ts';
import type { AppDefinition, AppDeploymentResult } from './app-types.ts';
import { writeAppSystemLog } from './app-system-log.ts';
import {
  getPathInsideApp,
  isAppAssetPath,
  serveAppAssets,
} from './static-client.ts';
import {
  acceptWebSocketUpgrade,
  isWebSocketUpgrade,
  rejectWebSocketUpgrade,
} from './websocket.ts';
import { installAppReleaseArchive } from './app-release-upload.ts';

export * from './errors.ts';
export * from './events.ts';
export * from './http-adapter.ts';
export * from './in-process-backend.ts';
export * from './app-catalog.ts';
export * from './app-registry.ts';
export * from './app-runtime.ts';
export * from './app-release.ts';
export * from './app-release-upload.ts';
export * from './app-release-state.ts';
export * from './app-lifecycle.ts';
export * from './app-lifecycle-state.ts';
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
  controlToken?: string;
  publicUrl?: string;
}

export interface AppHost {
  readonly appCatalog: DirectoryAppCatalog;
  readonly releaseStateStore: AppReleaseStateStore;
  readonly lifecycleStateStore: AppLifecycleStateStore;
  readonly lifecycle: AppLifecycleManager;
  readonly registry: AppRuntimeRegistry;
  readonly server: Server;
  start(): Promise<void>;
  close(reason?: string): Promise<void>;
}

export function createAppHost(options: AppHostOptions = {}): AppHost {
  const configuredPublicUrl = options.publicUrl
    ? parsePublicHttpUrl(options.publicUrl, {
        status: 500,
        code: 'APP_HOST_PUBLIC_URL_INVALID',
        label: 'APP_HOST_PUBLIC_URL',
      })
    : undefined;
  const appCatalog = new DirectoryAppCatalog({
    appsDir: options.appDistDir,
  });
  const releaseStateStore = new AppReleaseStateStore({
    appsDir: appCatalog.appsDir,
  });
  const lifecycleStateStore = new AppLifecycleStateStore({
    stateDir: releaseStateStore.stateDir,
  });
  const registry = new AppRuntimeRegistry({
    resolveFactory: (definition) => appCatalog.resolveFactory(definition),
    maxActiveApps: options.maxActiveApps,
    idleTtlMs: options.idleTtlMs,
    evictionIntervalMs: options.evictionIntervalMs,
  });
  const lifecycle = new AppLifecycleManager({
    registry,
    appCatalog,
    releaseStateStore,
    lifecycleStateStore,
  });

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    try {
      const path = requestPath(req);
      const managementResponse = await managementApi(
        req,
        path,
        registry,
        appCatalog,
        releaseStateStore,
        lifecycle,
        options.controlToken,
        configuredPublicUrl,
      );
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

        assertAppRequestAvailable(lifecycle, appId);

        const pathInside = getPathInsideApp(definition, path);

        if (isAppAssetPath(pathInside)) {
          const assetResponse = await serveAppAssets(
            definition,
            req,
            pathInside,
          );
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
          res.destroy(
            handleErrorError instanceof Error
              ? handleErrorError
              : new Error(String(handleErrorError)),
          );
        }
      }
    }
  };
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    void dispatchAppWebSocket(req, socket, head, registry, lifecycle).catch(
      (error) => {
        console.error(error);
        rejectWebSocketUpgrade(
          socket,
          error instanceof AppRegistryError ? error.status : 500,
        );
      },
    );
  });

  return {
    appCatalog,
    releaseStateStore,
    lifecycleStateStore,
    lifecycle,
    registry,
    server,
    async start(): Promise<void> {
      attachAppEventLogs(registry);
      let discoveredApps: AppDefinition[];

      try {
        discoveredApps = await appCatalog.registerDiscovered(registry);
        await lifecycle.initialize();
        await restoreActiveReleases(
          registry,
          appCatalog,
          releaseStateStore,
          lifecycle,
        );
      } catch (error) {
        try {
          await registry.destroyAll('startup restore failed');
        } catch (cleanupError) {
          throw new AggregateError(
            [error, cleanupError],
            'App host startup and cleanup failed',
            { cause: cleanupError },
          );
        }
        throw error;
      }

      await new Promise<void>((resolve) => {
        server.listen(
          options.port ?? 3000,
          options.host ?? '127.0.0.1',
          resolve,
        );
      });

      const address = server.address();
      const bind =
        typeof address === 'object' && address
          ? `${address.address}:${address.port}`
          : String(address);
      console.log(`App host listening on http://${bind}`);
      console.log(`App dist directory: ${appCatalog.appsDir}`);
      console.log(
        `Discovered ${discoveredApps.length} app(s): ${
          discoveredApps.map((app) => app.id).join(', ') || '(none)'
        }`,
      );
    },
    async close(reason: string = 'host shutdown'): Promise<void> {
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
  lifecycle: AppLifecycleManager,
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

  assertAppRequestAvailable(lifecycle, appId);

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
    controlToken: process.env.APP_HOST_CONTROL_TOKEN,
    publicUrl: process.env.APP_HOST_PUBLIC_URL,
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
    console.error(
      `[app] failed to create ${event.appId}@v${event.version} at ${event.basePath}`,
      event.error,
    );
  });

  registry.events.on('app:created', (event) => {
    console.log(
      `[app] created ${event.appId}@v${event.version} at ${event.basePath}`,
    );
  });

  registry.events.on('app:draining', (event) => {
    console.log(
      `[app] draining ${event.appId}@v${event.version}; activeRequests=${event.activeRequests}`,
    );
  });

  registry.events.on('app:resourceDisposed', (event) => {
    console.log(
      `[app] disposed ${event.appId}@v${event.version}: ${event.resourceName}`,
    );
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
  releaseStateStore: AppReleaseStateStore,
  lifecycle: AppLifecycleManager,
  controlToken?: string,
  publicUrl?: URL,
): Promise<Response | null> {
  const method = req.method ?? 'GET';

  if (
    isProtectedControlPath(path) &&
    controlToken &&
    !hasControlAccess(req, controlToken)
  ) {
    return jsonResponse(
      {
        error: 'Unauthorized',
        code: 'APP_HOST_UNAUTHORIZED',
      },
      {
        status: 401,
        headers: {
          'www-authenticate': 'Bearer realm="app-host-control"',
        },
      },
    );
  }

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
        'curl http://localhost:3000/__apps/acme/releases',
        'curl -X POST http://localhost:3000/__apps/acme/rollback',
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
    const [releases, activeReleaseState] = await Promise.all([
      appCatalog.listReleases(),
      releaseStateStore.read(),
    ]);
    const requestOrigin = resolveRequestOrigin(req);
    const appPublicUrl = publicUrl ?? requestOrigin;
    const definitions = registry.listDefinitions();
    const lifecycleAppIds = [
      ...definitions.map((definition) => definition.id),
      ...releases.map((release) => release.appId),
    ];
    return jsonResponse({
      active: registry.list().map((app) => ({
        ...app,
        accessUrl: joinPublicUrl(appPublicUrl, app.basePath),
      })),
      definitions: definitions.map((definition) => ({
        ...definition,
        accessUrl: joinPublicUrl(appPublicUrl, definition.basePath),
      })),
      releases: releases.map(toReleaseSummary),
      activeReleases: activeReleaseState.releases,
      lifecycle: lifecycle.list(lifecycleAppIds),
    });
  }

  if (method === 'GET' && path === '/__releases') {
    const releases = await appCatalog.listReleases();
    return jsonResponse({ releases: releases.map(toReleaseSummary) });
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

  const releasesMatch = path.match(/^\/__apps\/([^/]+)\/releases$/);
  if (releasesMatch) {
    const id = decodeURIComponent(releasesMatch[1]);
    if (method === 'POST') {
      const releaseId = singleHeader(req, 'x-nocobase-release-id');
      if (!releaseId) {
        return jsonResponse(
          {
            error: 'X-NocoBase-Release-Id is required',
            code: 'APP_RELEASE_ID_REQUIRED',
          },
          { status: 400 },
        );
      }
      const contentType = singleHeader(req, 'content-type')
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== 'application/gzip') {
        return jsonResponse(
          {
            error: 'Release upload content type must be application/gzip',
            code: 'APP_RELEASE_CONTENT_TYPE_INVALID',
          },
          { status: 415 },
        );
      }
      const release = await installAppReleaseArchive({
        appsDir: appCatalog.appsDir,
        appId: id,
        releaseId,
        source: req as AsyncIterable<Uint8Array>,
        maxArchiveBytes: numberFromEnv('APP_HOST_MAX_RELEASE_ARCHIVE_BYTES'),
        maxExtractedBytes: numberFromEnv(
          'APP_HOST_MAX_RELEASE_EXTRACTED_BYTES',
        ),
        maxEntries: numberFromEnv('APP_HOST_MAX_RELEASE_ENTRIES'),
      });
      return jsonResponse(
        { release },
        { status: release.status === 'created' ? 201 : 200 },
      );
    }
    if (method !== 'GET') {
      return methodNotAllowed('GET, POST');
    }
    const releases = await appCatalog.listReleases(id);
    return jsonResponse({ releases: releases.map(toReleaseSummary) });
  }

  const actionMatch = path.match(
    /^\/__apps\/([^/]+)\/(activate|deploy|evict|reload|rollback|start|stop|restart)$/,
  );
  if (actionMatch) {
    if (method !== 'POST') {
      return methodNotAllowed('POST');
    }

    const id = decodeURIComponent(actionMatch[1]);
    const action = actionMatch[2];

    if (action === 'activate') {
      const result = await lifecycle.start(id);
      return jsonResponse({
        app: result.app,
      });
    }

    if (action === 'start') {
      return jsonResponse({ lifecycle: await lifecycle.start(id) });
    }

    if (action === 'stop') {
      return jsonResponse({ lifecycle: await lifecycle.stop(id) });
    }

    if (action === 'restart') {
      return jsonResponse({ lifecycle: await lifecycle.restart(id) });
    }

    if (action === 'deploy' || action === 'rollback') {
      const input = await readJsonBody(req);
      const activeReleaseState = await releaseStateStore.read();
      const persistedPreviousReleaseId =
        activeReleaseState.releases.find((release) => release.appId === id)
          ?.releaseId ?? null;
      const releaseId =
        typeof input.releaseId === 'string' ? input.releaseId : undefined;
      if (action === 'rollback' && !releaseId) {
        return jsonResponse(
          {
            error: 'releaseId is required for rollback',
            code: 'RELEASE_ID_REQUIRED',
          },
          { status: 400 },
        );
      }

      const deployOptions = {
        version: typeof input.version === 'string' ? input.version : undefined,
        strategy:
          input.strategy === 'restart' || input.strategy === 'blue-green'
            ? input.strategy
            : undefined,
        destroyTimeoutMs: numberFromValue(input.destroyTimeoutMs),
        reason:
          action === 'rollback'
            ? `rollback to release ${releaseId}`
            : 'deploy API',
      } as const;
      let deployment: AppDeploymentResult;
      if (releaseId) {
        const definition = await appCatalog.resolveRelease(id, releaseId);
        const artifactSha256 = requireReleaseChecksum(definition);
        deployment = await registry.deployDefinition(definition, {
          ...deployOptions,
          onBeforePromote: async (): Promise<void> => {
            await releaseStateStore.setActiveRelease({
              appId: id,
              releaseId,
              artifactSha256,
            });
          },
        });
      } else {
        deployment = await registry.deploy(id, {
          ...deployOptions,
          onBeforePromote: async (): Promise<void> => {
            await releaseStateStore.clearActiveRelease(id);
          },
        });
      }
      if (!deployment.previousReleaseId && persistedPreviousReleaseId) {
        deployment = {
          ...deployment,
          previousReleaseId: persistedPreviousReleaseId,
          changed: persistedPreviousReleaseId !== deployment.activeReleaseId,
        };
      }
      return jsonResponse({
        deployment,
      });
    }

    if (action === 'evict') {
      return jsonResponse({
        evicted: await registry.evict(id, { reason: 'evict API' }),
      });
    }

    const result = await lifecycle.restart(id);
    return jsonResponse({ app: result.app });
  }

  const match = path.match(/^\/__apps\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const id = decodeURIComponent(match[1]);

  if (method === 'GET') {
    return jsonResponse({
      ...registry.status(id),
      lifecycle: lifecycle.status(id),
    });
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

function resolveAppId(
  path: string,
  registry: AppRuntimeRegistry,
): string | null {
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
        'POST /__apps/:id/start',
        'POST /__apps/:id/stop',
        'POST /__apps/:id/restart',
        'POST /__apps/:id/deploy',
        'GET /__apps/:id/releases',
        'POST /__apps/:id/rollback',
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

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of req as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    return {};
  }

  const value = JSON.parse(text) as unknown;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
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
      code:
        error instanceof AppRegistryError
          ? error.code
          : 'INTERNAL_SERVER_ERROR',
    },
    {
      status: error instanceof AppRegistryError ? error.status : 500,
    },
  );

  await applyFetchResponse(res, response);
}

function numberFromValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function numberFromEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveRequestOrigin(req: IncomingMessage): URL {
  const protocol = (
    firstForwardedValue(req.headers['x-forwarded-proto']) ?? 'http'
  ).toLowerCase();
  const host =
    firstForwardedValue(req.headers['x-forwarded-host']) ?? req.headers.host;
  if (!host) {
    throw new AppRegistryError('App Host request did not include a host', {
      status: 400,
      code: 'APP_HOST_REQUEST_HOST_REQUIRED',
    });
  }
  if (
    (protocol !== 'http' && protocol !== 'https') ||
    /[\s/@\\?#]/.test(host)
  ) {
    throw new AppRegistryError(
      'App Host request origin must use a valid HTTP(S) authority',
      {
        status: 400,
        code: 'APP_HOST_REQUEST_ORIGIN_INVALID',
      },
    );
  }
  return parsePublicHttpUrl(`${protocol}://${host}`, {
    status: 400,
    code: 'APP_HOST_REQUEST_ORIGIN_INVALID',
    label: 'App Host request origin',
  });
}

function joinPublicUrl(publicUrl: URL, basePath: string): string {
  const relative = basePath.replace(/^\/+/, '').replace(/\/+$/, '');
  return new URL(`${relative}/`, publicUrl).toString();
}

function parsePublicHttpUrl(
  value: string,
  error: { status: number; code: string; label: string },
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new AppRegistryError(`${error.label} must be a valid HTTP(S) URL`, {
      status: error.status,
      code: error.code,
      cause,
    });
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password
  ) {
    throw new AppRegistryError(
      `${error.label} must use HTTP(S) without embedded credentials`,
      {
        status: error.status,
        code: error.code,
      },
    );
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  url.search = '';
  url.hash = '';
  return url;
}

function firstForwardedValue(
  value: string | string[] | undefined,
): string | undefined {
  const first = Array.isArray(value) ? value[0] : value?.split(',', 1)[0];
  return first?.trim() || undefined;
}

function singleHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

function isProtectedControlPath(path: string): boolean {
  return (
    path === '/__health' ||
    path === '/__apps' ||
    path.startsWith('/__apps/') ||
    path === '/__releases'
  );
}

function hasControlAccess(
  req: IncomingMessage,
  expectedToken: string,
): boolean {
  const authorization = req.headers.authorization;
  const providedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  return (
    expected.length === provided.length &&
    expected.length > 0 &&
    timingSafeEqual(expected, provided)
  );
}

async function restoreActiveReleases(
  registry: AppRuntimeRegistry,
  appCatalog: DirectoryAppCatalog,
  releaseStateStore: AppReleaseStateStore,
  lifecycle: AppLifecycleManager,
): Promise<void> {
  const state = await releaseStateStore.read();

  for (const record of state.releases) {
    const definition = await appCatalog.resolveRelease(
      record.appId,
      record.releaseId,
    );
    assertPersistedReleaseChecksum(record, definition);
    if (lifecycle.isStopped(record.appId)) {
      await registry.setDefinition(definition);
    } else {
      await registry.deployDefinition(definition, {
        reason: `restore active release ${record.releaseId}`,
      });
    }
  }
}

function assertAppRequestAvailable(
  lifecycle: AppLifecycleManager,
  appId: string,
): void {
  const reason = lifecycle.requestBlockedReason(appId);
  if (reason === 'in-progress') {
    throw new AppLifecycleTransitionError(appId);
  }
  if (reason === 'stopped') {
    throw new AppStoppedError(appId);
  }
}

function assertPersistedReleaseChecksum(
  record: ActiveReleaseRecord,
  definition: AppDefinition,
): void {
  const actualChecksum = requireReleaseChecksum(definition);
  if (actualChecksum !== record.artifactSha256) {
    throw new AppReleaseIntegrityError(
      record.appId,
      record.releaseId,
      `persisted checksum ${record.artifactSha256} does not match release checksum ${actualChecksum}`,
    );
  }
}

function requireReleaseChecksum(definition: AppDefinition): string {
  const releaseId = definition.release?.id ?? 'unknown';
  const checksum = definition.release?.checksum;
  if (!checksum) {
    throw new AppReleaseIntegrityError(
      definition.id,
      releaseId,
      'release checksum is missing',
    );
  }
  return checksum;
}

function toReleaseSummary(
  release: Awaited<ReturnType<DirectoryAppCatalog['listReleases']>>[number],
) {
  return {
    appId: release.appId,
    id: release.id,
    version: release.version,
    createdAt: release.createdAt,
    runtime: release.manifest.runtime ?? {},
  };
}
