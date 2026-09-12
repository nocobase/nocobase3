/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import { createDriveManager, type AppDriveDiskConfig } from '@nocobase/drive';
import {
  createLogging,
  type Logger,
  type Logging,
  type LoggingConfig,
} from '@nocobase/logging';
import { AppRegistryError } from './errors.ts';
import {
  applyFetchResponse,
  isClientResponseClose,
  requestPath,
  toFetchRequest,
} from './http-adapter.ts';
import {
  DriveArtifactResolver,
  type ArtifactResolver,
} from './artifact-resolver.ts';
import { AppModuleLoader, DeploymentCatalog } from './deployment/index.ts';
import { loadAppHostConfig } from './host-config.ts';
import { resolveAppHostMode, type AppHostMode } from './host-mode.ts';
import { AppRuntimeRegistry } from './app-registry.ts';
import type { AppActivationBackend } from './app-types.ts';
import {
  HostManager,
  type HostManagementService,
  IpcHostManagementServer,
} from './management/index.ts';
import {
  getPathInsideApp,
  isAppAssetPath,
  serveAppAssets,
} from './static-client.ts';
import {
  acceptWebSocketUpgrade,
  isWebSocketUpgrade,
  rejectWebSocketUpgrade,
} from '@nocobase/app-websocket';

export * from './errors.ts';
export * from './events.ts';
export * from './http-adapter.ts';
export * from './host-mode.ts';
export * from './host-config.ts';
export * from './in-process-backend.ts';
export * from './deployment/index.ts';
export * from './artifact-resolver.ts';
export * from './app-registry.ts';
export * from './in-process-app-handle.ts';
export * from './static-client.ts';
export * from './app-types.ts';
export * from './management/index.ts';

export interface AppHostOptions {
  mode?: AppHostMode;
  port?: number;
  host?: string;
  appDeploymentsDir?: string;
  appVolumesDir?: string;
  artifact?: AppDriveDiskConfig;
  artifactResolver?: ArtifactResolver;
  logging?: LoggingConfig;
  backends?: AppActivationBackend[];
  maxActiveApps?: number;
  idleTtlMs?: number;
  evictionIntervalMs?: number;
}

export interface AppHost {
  readonly mode: AppHostMode;
  readonly deploymentCatalog: DeploymentCatalog;
  readonly artifactResolver: ArtifactResolver;
  readonly management: HostManagementService;
  readonly logger: Logger;
  readonly logging: Logging;
  readonly registry: AppRuntimeRegistry;
  readonly server: Server;
  start(): Promise<void>;
  close(reason?: string): Promise<void>;
}

export function createAppHost(options: AppHostOptions = {}): AppHost {
  const mode = resolveAppHostMode(options.mode);
  const logging = createLogging(
    options.logging ?? {
      default: 'host',
      name: 'app-host',
      level: 'info',
      base: { service: 'app-host' },
    },
  );
  const logger = logging.getLogger();
  const deploymentCatalog = new DeploymentCatalog({
    deploymentsDir: options.appDeploymentsDir,
    volumesDir: options.appVolumesDir,
  });
  const moduleLoader = new AppModuleLoader();
  const artifact = options.artifact ?? {
    driver: 'fs',
    location: path.resolve(process.cwd(), 'storage', 'app-artifacts'),
    visibility: 'private',
  };
  const drive = createDriveManager({
    default: 'artifact',
    disks: { artifact },
  });
  const artifactResolver =
    options.artifactResolver ??
    new DriveArtifactResolver(drive.use('artifact'), deploymentCatalog, {
      appDeploymentsDir: deploymentCatalog.deploymentsDir,
      localArtifactDir:
        artifact.driver === 'fs' ? artifact.location : undefined,
      logger: logger.child({ component: 'artifact-resolver' }),
      expandedRevisionLimit: mode === 'managed' ? 3 : undefined,
    });
  const registry = new AppRuntimeRegistry({
    resolveFactory: (definition) => moduleLoader.resolveFactory(definition),
    backends: options.backends,
    maxActiveApps: options.maxActiveApps,
    idleTtlMs: options.idleTtlMs,
    evictionIntervalMs: options.evictionIntervalMs,
    logger: logger.child({ component: 'app-runtime' }),
  });
  attachAppEventLogs(registry, logger);
  const manager = new HostManager({
    mode,
    registry,
    deploymentCatalog,
    artifactResolver,
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
        mode,
        manager,
        registry,
        deploymentCatalog,
        artifactResolver,
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
        await handleError(error, res, logger);
      } catch (handleErrorError) {
        if (!isClientResponseClose(handleErrorError, res)) {
          logger.error(
            { err: handleErrorError },
            'Failed to handle request error',
          );
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
    const requestPromise = handleRequest(req, res);
    requestPromise.catch((error: unknown) => {
      logger.error({ err: error }, 'Unhandled request error');
      if (!res.destroyed) {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const upgradePromise = dispatchAppWebSocket(req, socket, head, registry);
    upgradePromise.catch((error: unknown) => {
      logger.error({ err: error }, 'WebSocket upgrade failed');
      rejectWebSocketUpgrade(
        socket,
        error instanceof AppRegistryError ? error.status : 500,
      );
    });
  });

  return {
    mode,
    deploymentCatalog,
    artifactResolver,
    logger,
    logging,
    management: manager,
    registry,
    server,
    async start() {
      const discoveredApps = await manager.initialize();
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
      logger.info({ bind, mode }, 'App host started');
      if (mode === 'standalone') {
        logger.info(
          {
            deploymentsDir: deploymentCatalog.deploymentsDir,
            discoveredApps:
              discoveredApps?.registered.map((app) => app.id) ?? [],
          },
          'Standalone deployments discovered',
        );
      }
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
      await logging.close();
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
  const config = await loadAppHostConfig();
  const host = createAppHost({
    mode: config.mode,
    port: config.server.port,
    host: config.server.host,
    appDeploymentsDir: config.appDeploymentsDir,
    appVolumesDir: config.appVolumesDir,
    artifact: config.artifact,
    maxActiveApps: config.maxActiveApps,
    idleTtlMs: config.idleTtlMs,
    evictionIntervalMs: config.evictionIntervalMs,
    logging: config.logging,
  });

  if (host.mode === 'managed') {
    const session = process.env.APP_HOST_SESSION;
    if (!session) {
      throw new Error('Managed app host requires APP_HOST_SESSION');
    }
    const ipcServer = new IpcHostManagementServer(host.management, session);
    ipcServer.attach();
    process.once('disconnect', () => {
      ipcServer.close();
      host
        .close('hub IPC disconnected')
        .then(() => process.exit(0))
        .catch((error: unknown) => {
          host.logger.error(
            { err: error },
            'Failed to close disconnected host',
          );
          process.exit(1);
        });
    });
  }

  await host.start();
  return host;
}

function attachAppEventLogs(
  registry: AppRuntimeRegistry,
  logger: Logger,
): void {
  registry.events.on('app:createFailed', (event) => {
    logger.error(
      { ...event, err: event.error, event: 'app:createFailed' },
      'Embedded app failed to initialize',
    );
  });

  registry.events.on('app:created', (event) => {
    logger.info({ ...event, event: 'app:created' }, 'App runtime created');
  });

  registry.events.on('app:draining', (event) => {
    logger.info({ ...event, event: 'app:draining' }, 'App runtime draining');
  });

  registry.events.on('app:resourceDisposed', (event) => {
    logger.debug(
      { ...event, event: 'app:resourceDisposed' },
      'App runtime resource disposed',
    );
  });

  registry.events.on('app:destroyed', (event) => {
    logger.info({ ...event, event: 'app:destroyed' }, 'App runtime destroyed');
  });
}

async function managementApi(
  req: IncomingMessage,
  path: string,
  mode: AppHostMode,
  manager: HostManager,
  registry: AppRuntimeRegistry,
  deploymentCatalog: DeploymentCatalog,
  artifactResolver: ArtifactResolver,
): Promise<Response | null> {
  const method = req.method ?? 'GET';

  if (
    mode === 'managed' &&
    path !== '/__live' &&
    path !== '/__ready' &&
    path !== '/__health'
  ) {
    return null;
  }

  if (method === 'GET' && path === '/__live') {
    return jsonResponse({ status: 'ok' });
  }

  if (method === 'GET' && path === '/__ready') {
    const status = await manager.getStatus();
    return jsonResponse(
      { status: status.ready ? 'ready' : 'not-ready' },
      status.ready ? {} : { status: 503 },
    );
  }

  if (mode === 'managed' && method === 'GET' && path === '/__health') {
    const status = await manager.getStatus();
    return jsonResponse(
      { status: status.ready ? 'ready' : 'not-ready' },
      status.ready ? {} : { status: 503 },
    );
  }

  if (method === 'GET' && path === '/') {
    return jsonResponse({
      message: 'Node HTTP app host',
      mode,
      packages: {
        appHost: '@nocobase/app-host',
        appDeploymentsDir: deploymentCatalog.deploymentsDir,
        appVolumesDir: deploymentCatalog.volumesDir,
      },
      examples: [
        'add app-deployments/acme/dist/server/embedded.js, then call POST /__apps/rescan',
        'put hashed static files under app-deployments/acme/dist/client/assets for /acme/assets/*',
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
    return jsonResponse({
      ...registry.health(),
      mode,
      management: await manager.getStatus(),
    });
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

    const sync = await manager.rescan();
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

  const actionMatch = path.match(
    /^\/__apps\/([^/]+)\/(activate|deploy|evict|reload)$/,
  );
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
      const reference = input.artifact;
      if (!isArtifactReference(reference) || reference.appId !== id) {
        return jsonResponse(
          {
            error: 'Deploy requires an artifact reference matching the app ID',
          },
          { status: 400 },
        );
      }
      const artifact = await artifactResolver.resolve(reference);
      try {
        const current = registry.definition(id);
        const replacement = await registry.replaceDefinition(
          {
            ...artifact.definition,
            basePath: current?.basePath ?? artifact.definition.basePath,
            dataDir: current?.dataDir ?? artifact.definition.dataDir,
            configPath: current?.configPath ?? artifact.definition.configPath,
          },
          {
            activate: true,
            reason: 'deploy API',
            destroyTimeoutMs: numberFromValue(input.destroyTimeoutMs),
          },
        );
        await artifact.commit();
        return jsonResponse({ deployment: replacement });
      } catch (error) {
        await artifact.rollback();
        throw error;
      }
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
          'App creation through API is disabled. Add app-deployments/<app>/dist/server/embedded.js and call POST /__apps/rescan.',
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

function isArtifactReference(
  value: unknown,
): value is import('./artifact-resolver.ts').ArtifactReference {
  if (!value || typeof value !== 'object') return false;
  const reference = value as Record<string, unknown>;
  return (
    typeof reference.key === 'string' &&
    typeof reference.appId === 'string' &&
    typeof reference.version === 'string' &&
    typeof reference.checksum === 'string'
  );
}

function resolveAppId(
  path: string,
  registry: AppRuntimeRegistry,
): string | null {
  const matchingDefinition = registry
    .listDefinitions()
    .sort((a, b) => b.basePath.length - a.basePath.length)
    .find(
      (definition) =>
        path === definition.basePath ||
        path.startsWith(`${definition.basePath}/`),
    );
  if (matchingDefinition) {
    return matchingDefinition.id;
  }

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

async function readJsonBody(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const streamedChunk of req) {
    const chunk: unknown = streamedChunk;
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      throw new TypeError('Request body contained an unsupported chunk type');
    }
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

async function handleError(
  error: unknown,
  res: ServerResponse,
  logger: Logger,
): Promise<void> {
  if (!(error instanceof AppRegistryError) || error.status >= 500) {
    logger.error({ err: error }, 'Request failed');
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
