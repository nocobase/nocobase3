import { createAdaptorServer, type ServerType } from '@hono/node-server';
import { createAppHost, type AppHost } from '@nocobase/app-host';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createApp,
  joinBasePath,
  normalizeBasePath,
  type HubApp,
} from './app.js';
import {
  type EnvMap,
  getEnvBoolean,
  getEnvString,
  readEnvFiles,
} from './env.js';

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
}

export function createStandaloneServer(
  options: StandaloneServerOptions = {},
): HubApp {
  const env = loadServerEnv();

  return createStandaloneServerWithRegistry(options, env);
}

function createStandaloneServerWithRegistry(
  options: StandaloneServerOptions,
  env: EnvMap,
  appHostRegistry?: AppHost['registry'],
): HubApp {
  const viteDevUrl = resolveViteDevUrl(options.viteDevUrl, env);
  const packageRoot = getPackageRoot();
  const defaultAppResourcesDirectory = resolveDefaultAppResourcesDirectory(
    env,
    packageRoot,
  );
  const repositorySeedPath =
    getEnvString(env, 'HUB_REPOSITORY_SEED_PATH') ??
    (defaultAppResourcesDirectory
      ? path.join(defaultAppResourcesDirectory, 'source.bundle')
      : undefined);
  const appName = getEnvString(env, 'APP_NAME') ?? 'hub';
  const basePath = normalizeBasePath(
    getEnvString(env, 'APP_BASE_PATH') ?? `/${appName}`,
  );
  const browserBasePath = normalizeBasePath(
    getEnvString(env, 'APP_BROWSER_BASE_PATH') ?? basePath,
  );
  const proxy = resolveApiProxyFromEnv(env, basePath);
  const authSecret = getEnvString(env, 'AUTH_SECRET');
  const hubEnabled = getEnvBoolean(env, 'HUB_ENABLED') ?? true;

  return createApp({
    appName,
    basePath,
    browserBasePath,
    apiProxyPath: proxy?.path,
    clientHandler: viteDevUrl
      ? (request) => proxyToViteDevServer(request, viteDevUrl)
      : undefined,
    clientIndexPath:
      getEnvString(env, 'APP_CLIENT_INDEX') ??
      path.join(packageRoot, 'dist/client/index.html'),
    nocoBaseApiUrl: proxy?.target,
    hub: hubEnabled,
    authSecret,
    authBaseUrl: getEnvString(env, 'AUTH_BASE_URL'),
    databasePath: getEnvString(env, 'HUB_DATABASE_PATH'),
    releaseRoot: getEnvString(env, 'HUB_RELEASE_ROOT'),
    sourceRoot: getEnvString(env, 'HUB_SOURCE_ROOT'),
    repositorySeedPath,
    defaultAppResourcesDirectory,
    appPublicOrigin: getEnvString(env, 'APP_PUBLIC_ORIGIN'),
    runtimeSecretEncryptionKey: getEnvString(env, 'HUB_SECRET_ENCRYPTION_KEY'),
    runtimeSecretEncryptionKeyFile: getEnvString(
      env,
      'HUB_SECRET_ENCRYPTION_KEY_FILE',
    ),
    maxUploadBytes: numberFromEnv(env, 'HUB_MAX_UPLOAD_BYTES'),
    maxArtifactBytes: numberFromEnv(env, 'HUB_MAX_ARTIFACT_BYTES'),
    uploadTtlSeconds: numberFromEnv(env, 'HUB_UPLOAD_TTL_SECONDS'),
    appHostRegistry,
    apiClientStoragePrefix: getEnvString(env, 'API_CLIENT_STORAGE_PREFIX'),
    apiClientStorageType: getEnvString(env, 'API_CLIENT_STORAGE_TYPE'),
    apiClientShareToken: getEnvBoolean(env, 'API_CLIENT_SHARE_TOKEN'),
  });
}

function resolveDefaultAppResourcesDirectory(
  env: EnvMap,
  packageRoot: string,
): string | undefined {
  const configured = getEnvString(env, 'HUB_DEFAULT_APP_RESOURCES_DIR');
  if (configured) {
    const candidate = path.resolve(configured);
    return fs.existsSync(path.join(candidate, 'metadata.json'))
      ? candidate
      : undefined;
  }

  return [
    path.join(packageRoot, 'resources', 'default-app'),
    path.join(packageRoot, 'dist', 'resources', 'default-app'),
  ].find((candidate) => fs.existsSync(path.join(candidate, 'metadata.json')));
}

export function startServer(): void {
  void startServerAsync().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function startServerAsync(): Promise<void> {
  const env = loadServerEnv();
  const appHost = createAppHost({
    port:
      numberFromEnv(env, 'APP_HOST_PORT') ?? numberFromEnv(env, 'PORT') ?? 3000,
    host:
      getEnvString(env, 'APP_HOST_BIND') ??
      getEnvString(env, 'HOST') ??
      '127.0.0.1',
    appDistDir: resolveStandaloneCatalogDirectory(env),
  });
  const app = createStandaloneServerWithRegistry({}, env, appHost.registry);
  const host = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const port = numberFromEnv(env, 'APP_SERVER_PORT') ?? 13000;
  const server = createAdaptorServer({ fetch: app.fetch });
  const shutdown = waitForShutdown(server, appHost);
  void shutdown.promise.catch(() => undefined);
  try {
    await startAppHost(appHost);
    if (shutdown.stopping()) {
      await shutdown.promise;
      return;
    }
    await app.hubReady;
    if (shutdown.stopping()) {
      await shutdown.promise;
      return;
    }

    await listenServer(server, host, port, (info) => {
      if (getEnvString(env, 'APP_SERVER_START_LOG') !== 'false') {
        console.log(
          `App server listening on http://${info.address}:${info.port}`,
        );
      }
    });

    await shutdown.promise;
  } finally {
    shutdown.dispose();
    await closeStandalone(server, app, appHost);
  }
}

function resolveStandaloneCatalogDirectory(env: EnvMap): string | undefined {
  const releaseRoot = getEnvString(env, 'HUB_RELEASE_ROOT');
  if (releaseRoot) {
    return path.join(path.resolve(releaseRoot), '.catalog');
  }
  return getEnvString(env, 'APP_DIST_DIR');
}

function startAppHost(appHost: AppHost): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const onError = (error: Error): void => {
      settled = true;
      appHost.server.off('error', onError);
      reject(error);
    };
    appHost.server.once('error', onError);
    void appHost.start().then(
      () => {
        if (settled) return;
        settled = true;
        appHost.server.off('error', onError);
        resolve();
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        appHost.server.off('error', onError);
        reject(toError(error));
      },
    );
  });
}

interface ShutdownWaiter {
  readonly promise: Promise<void>;
  stopping(): boolean;
  dispose(): void;
}

function waitForShutdown(server: ServerType, appHost: AppHost): ShutdownWaiter {
  let stopping = false;
  const handlers = new Map<NodeJS.Signals, () => void>();
  let resolveShutdown!: () => void;
  let rejectShutdown!: (error: Error) => void;
  const promise = new Promise<void>((resolve, reject) => {
    resolveShutdown = resolve;
    rejectShutdown = reject;
  });
  const dispose = (): void => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
    server.off('error', onError);
    appHost.server.off('error', onError);
  };
  const onError = (error: Error): void => {
    if (stopping) return;
    stopping = true;
    rejectShutdown(error);
  };
  const requestShutdown = (): void => {
    if (stopping) return;
    stopping = true;
    resolveShutdown();
  };
  server.once('error', onError);
  appHost.server.once('error', onError);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    handlers.set(signal, requestShutdown);
    process.once(signal, requestShutdown);
  }
  return {
    promise,
    stopping: () => stopping,
    dispose,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function listenServer(
  server: ServerType,
  host: string,
  port: number,
  onListening: (info: { address: string | null; port: number }) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListeningEvent);
      reject(error);
    };
    const onListeningEvent = (): void => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to resolve the Hub server address.'));
        return;
      }
      onListening({ address: address.address, port: address.port });
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListeningEvent);
    server.listen(port, host);
  });
}

async function closeStandalone(
  server: ServerType | undefined,
  app: ReturnType<typeof createApp>,
  appHost: AppHost,
): Promise<void> {
  const closeErrors: unknown[] = [];
  await new Promise<void>((resolve, reject) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  }).catch((error: unknown) => closeErrors.push(error));
  await app.close?.().catch((error: unknown) => closeErrors.push(error));
  await appHost
    .close('Hub standalone shutdown')
    .catch((error: unknown) => closeErrors.push(error));
  if (closeErrors.length > 0) {
    throw new AggregateError(
      closeErrors,
      'Failed to close Hub standalone runtime.',
    );
  }
}

function resolveViteDevUrl(
  value: string | false | undefined,
  env: EnvMap,
): URL | undefined {
  if (value === false || getEnvString(env, 'NODE_ENV') === 'production') {
    return undefined;
  }

  const raw =
    value ??
    getEnvString(env, 'APP_VITE_DEV_URL') ??
    resolveViteDevUrlFromEnv(env);
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim();
  if (!normalized || normalized === 'false' || normalized === '0') {
    return undefined;
  }

  return new URL(normalized);
}

function resolveViteDevUrlFromEnv(env: EnvMap): string | undefined {
  const host = getEnvString(env, 'APP_VITE_DEV_HOST');
  const port = getEnvString(env, 'APP_VITE_DEV_PORT');
  if (!host && !port) {
    return undefined;
  }

  return `http://${host ?? '127.0.0.1'}:${port ?? '5173'}`;
}

async function proxyToViteDevServer(
  request: Request,
  viteDevUrl: URL,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    viteDevUrl,
  );
  const headers = new Headers(request.headers);
  headers.delete('cookie');
  headers.set('host', targetUrl.host);
  headers.set('accept-encoding', 'identity');
  alignRequestOrigin(headers, requestUrl.origin, viteDevUrl);
  removeHopByHopHeaders(headers);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
      redirect: 'manual',
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: createProxyResponseHeaders(response.headers),
    });
  } catch (error) {
    console.error('Vite dev proxy request failed.', {
      error,
      target: targetUrl.href,
    });
    return Response.json(
      {
        error: 'Vite dev server is unavailable.',
      },
      {
        status: 502,
      },
    );
  }
}

function alignRequestOrigin(
  headers: Headers,
  requestOrigin: string,
  targetOrigin: URL,
): void {
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
}

function createProxyResponseHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);
  removeHopByHopHeaders(nextHeaders);
  nextHeaders.delete('content-encoding');
  nextHeaders.delete('content-length');
  return nextHeaders;
}

function removeHopByHopHeaders(headers: Headers): void {
  for (const header of [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]) {
    headers.delete(header);
  }
}

function loadServerEnv(): EnvMap {
  const root = getPackageRoot();
  const envFiles = [path.join(root, '.env'), path.join(root, '.env.local')];
  return {
    ...readEnvFiles(envFiles, process.env),
    ...process.env,
  };
}

function getPackageRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(path.dirname(moduleDir)) === 'dist') {
    return path.resolve(moduleDir, '../..');
  }

  return path.resolve(moduleDir, '..');
}

function numberFromEnv(env: EnvMap, name: string): number | undefined {
  const value = getEnvString(env, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveApiProxyFromEnv(
  env: EnvMap,
  basePath: string,
): { path: string; target: string } | undefined {
  const target = getEnvString(env, 'NOCOBASE_API_PROXY_TARGET');
  const rawPath = getEnvString(env, 'NOCOBASE_API_PROXY_PATH');
  if (!target || !rawPath) {
    return undefined;
  }

  let pathValue: string;
  try {
    pathValue = new URL(rawPath).pathname;
  } catch {
    pathValue = rawPath;
  }

  const normalizedPath = normalizeBasePath(pathValue);
  return {
    path:
      normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`)
        ? normalizedPath
        : joinBasePath(basePath, normalizedPath),
    target,
  };
}

if (isEntrypoint()) {
  startServer();
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(entry) === fs.realpathSync(modulePath);
  } catch {
    return path.resolve(entry) === modulePath;
  }
}
