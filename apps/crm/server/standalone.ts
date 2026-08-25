import { serve } from '@hono/node-server';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type EnvMap,
  getEnvBoolean,
  getEnvString,
  readEnvFiles,
} from '@nocobase/app-server-kit/config';
import { createOriginProxyHandler } from '@nocobase/app-server-kit/proxy';
import {
  joinBasePath,
  normalizeBasePath,
} from '@nocobase/app-server-kit/support';

import { createApp, type CreateAppOptions } from './app.js';
import { createCrmRuntime } from './runtime.js';
import { resolvePersistentAuthSecret } from './secret.js';

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
}

export type StandaloneServer = ReturnType<typeof createApp> & {
  close(): Promise<void>;
  ready(): Promise<void>;
};

export function createStandaloneServer(
  options: StandaloneServerOptions = {},
): StandaloneServer {
  const env = loadServerEnv();
  const viteDevUrl = resolveViteDevUrl(options.viteDevUrl, env);
  const packageRoot = getPackageRoot();
  const serverDir = getServerDirectory();
  const appName = getEnvString(env, 'APP_NAME') ?? 'crm';
  const basePath = normalizeBasePath(
    getEnvString(env, 'APP_BASE_PATH') ?? `/${appName}`,
  );
  const browserBasePath = normalizeBasePath(
    getEnvString(env, 'APP_BROWSER_BASE_PATH') ?? basePath,
  );
  const host = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const port = numberFromEnv(env, 'APP_SERVER_PORT') ?? 13000;
  const dataDir =
    getEnvString(env, 'CRM_DATA_DIR') ?? path.join(packageRoot, 'data');
  const crmRuntime = createCrmRuntime({
    appName,
    authBasePath: joinBasePath(basePath, '/api/auth'),
    authSecret: resolvePersistentAuthSecret(
      dataDir,
      getEnvString(env, 'AUTH_SECRET'),
    ),
    baseURL:
      getEnvString(env, 'NOCOBASE_AUTH_URL') ??
      `http://${toUrlHost(host)}:${port}${joinBasePath(browserBasePath, '/api/auth')}`,
    databasePath:
      getEnvString(env, 'CRM_DATABASE_PATH') ??
      path.join(dataDir, 'crm.sqlite'),
    migrationsDirectory: path.join(serverDir, 'migrations'),
    seedPath: resolveSeedPath(serverDir),
    publicBasePath: browserBasePath,
    allowAdditionalSignUp: getEnvBoolean(env, 'CRM_ALLOW_ADDITIONAL_SIGN_UP'),
  });
  const appOptions: CreateAppOptions = {
    appName,
    basePath,
    browserBasePath,
    apiProxyPath: joinBasePath(basePath, '/api'),
    browserApiUrl: joinBasePath(browserBasePath, '/api'),
    clientHandler: viteDevUrl
      ? createOriginProxyHandler(viteDevUrl)
      : undefined,
    clientIndexPath:
      getEnvString(env, 'APP_CLIENT_INDEX') ??
      path.join(packageRoot, 'dist/client/index.html'),
    apiClientStoragePrefix: getEnvString(env, 'API_CLIENT_STORAGE_PREFIX'),
    apiClientStorageType: getEnvString(env, 'API_CLIENT_STORAGE_TYPE'),
    apiClientShareToken: getEnvBoolean(env, 'API_CLIENT_SHARE_TOKEN'),
    releaseId: getEnvString(env, 'APP_RELEASE_ID'),
    crmRuntime,
  };

  return Object.assign(createApp(appOptions), {
    close: () => crmRuntime.close(),
    ready: () => crmRuntime.ready(),
  });
}

export function startServer(): void {
  void startServerAsync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function startServerAsync(): Promise<void> {
  const env = loadServerEnv();
  const app = createStandaloneServer();
  await app.ready();
  const host = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const port = numberFromEnv(env, 'APP_SERVER_PORT') ?? 13000;
  const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
    if (getEnvString(env, 'APP_SERVER_START_LOG') !== 'false') {
      console.log(
        `App server listening on http://${info.address}:${info.port}`,
      );
    }
  });
  let closing = false;
  const close = (): void => {
    if (closing) return;
    closing = true;
    server.close(() => {
      void app.close().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

function resolveViteDevUrl(
  value: string | false | undefined,
  env: EnvMap,
): URL | undefined {
  if (value === false || getEnvString(env, 'NODE_ENV') === 'production')
    return undefined;
  const raw =
    value ??
    getEnvString(env, 'APP_VITE_DEV_URL') ??
    resolveViteDevUrlFromEnv(env);
  if (!raw) return undefined;
  const normalized = raw.trim();
  if (!normalized || normalized === 'false' || normalized === '0')
    return undefined;
  return new URL(normalized);
}

function resolveSeedPath(serverDir: string): string {
  const bundledSeed = path.join(serverDir, 'seed', 'demo-data.json');
  return existsSync(bundledSeed)
    ? bundledSeed
    : path.resolve(serverDir, '../nocobase/seed/demo-data.json');
}

function resolveViteDevUrlFromEnv(env: EnvMap): string | undefined {
  const host = getEnvString(env, 'APP_VITE_DEV_HOST');
  const port = getEnvString(env, 'APP_VITE_DEV_PORT');
  if (!host && !port) return undefined;
  return `http://${host ?? '127.0.0.1'}:${port ?? '5173'}`;
}

function loadServerEnv(): EnvMap {
  const root = getPackageRoot();
  return {
    ...readEnvFiles(
      [path.join(root, '.env'), path.join(root, '.env.local')],
      process.env,
    ),
    ...process.env,
  };
}

function getPackageRoot(): string {
  const moduleDir = getServerDirectory();
  return path.basename(path.dirname(moduleDir)) === 'dist'
    ? path.resolve(moduleDir, '../..')
    : path.resolve(moduleDir, '..');
}

function getServerDirectory(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function numberFromEnv(env: EnvMap, name: string): number | undefined {
  const value = getEnvString(env, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function toUrlHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return '127.0.0.1';
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

if (isEntrypoint()) startServer();

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return Boolean(
    entry && path.resolve(entry) === fileURLToPath(import.meta.url),
  );
}
