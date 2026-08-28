import { serve } from '@hono/node-server';
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
  resolveApiProxyPath,
} from '@nocobase/app-server-kit/support';

import { createApp, type CreateAppOptions } from './app.js';
import { createReleaseManagementApiPlugin } from '@nocobase/hub-release-management/server';
import { createSettingsManagement } from './settings/index.js';
import { createNativeAuthRuntime } from './native-auth/index.js';
import {
  startHubAppHostRuntime,
  type HubAppHostRuntime,
} from './app-host-runtime.js';

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
  appHostUrl?: string | URL;
  appHostRuntime?: HubAppHostRuntime;
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
  const appName = getEnvString(env, 'APP_NAME') ?? 'hub';
  const basePath = normalizeBasePath(
    getEnvString(env, 'APP_BASE_PATH') ?? `/${appName}`,
  );
  const browserBasePath = normalizeBasePath(
    getEnvString(env, 'APP_BROWSER_BASE_PATH') ?? basePath,
  );
  const apiProxyPath = resolveApiProxyPathFromEnv(env, basePath);
  const nocoBaseApiUrl = getEnvString(env, 'NOCOBASE_API_PROXY_TARGET');
  const serverHost = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const serverPort = numberFromEnv(env, 'APP_SERVER_PORT') ?? 13001;
  const appHostUrl =
    options.appHostUrl?.toString() ??
    getEnvString(env, 'APP_HOST_URL') ??
    getEnvString(env, 'APP_HOST_CONTROL_URL') ??
    `http://127.0.0.1:${getEnvString(env, 'APP_HOST_PORT') ?? '13010'}`;
  const nativeAuth = createNativeAuthRuntime({
    appName,
    authBasePath: joinBasePath(basePath, '/api/auth'),
    authSecret: resolveAuthSecret(env),
    baseURL: resolveAuthBaseUrl(env, serverHost, serverPort, browserBasePath),
    databasePath:
      getEnvString(env, 'HUB_DATABASE_PATH') ??
      path.join(packageRoot, 'data/hub.sqlite'),
    migrationsDirectory: path.join(getServerDirectory(), 'migrations'),
    publicBasePath: browserBasePath,
  });
  const adminEmails = parseList(getEnvString(env, 'HUB_ADMIN_EMAILS'));
  const releaseManagementPlugin = createReleaseManagementApiPlugin({
    appHostUrl,
    appHostControlToken: getEnvString(env, 'APP_HOST_CONTROL_TOKEN'),
    appHostUploadTimeoutMs: numberFromEnv(
      env,
      'HUB_APP_HOST_UPLOAD_TIMEOUT_MS',
    ),
    nativeAuth,
    database: nativeAuth.database,
    adminEmails,
    nocoBaseApiUrl,
    auditAccessToken: getEnvString(env, 'HUB_RELEASE_AUDIT_TOKEN'),
    auditRole: getEnvString(env, 'HUB_RELEASE_AUDIT_ROLE'),
    auditCollection: getEnvString(env, 'HUB_RELEASE_AUDIT_COLLECTION'),
    storePath:
      getEnvString(env, 'HUB_RELEASE_STORE_PATH') ??
      path.join(packageRoot, 'data/release-management.json'),
    appStorePath:
      getEnvString(env, 'HUB_APP_STORE_PATH') ??
      path.join(packageRoot, 'data/apps.json'),
    allowedRoles: parseRoles(getEnvString(env, 'HUB_RELEASE_MANAGER_ROLES')),
    approvalRequired: getEnvBoolean(env, 'HUB_RELEASE_APPROVAL_REQUIRED'),
    rollbackEnabled: getEnvBoolean(env, 'HUB_RELEASE_ROLLBACK_ENABLED'),
    deployToken: getEnvString(env, 'HUB_DEPLOY_TOKEN'),
  });
  const settingsManagement = createSettingsManagement({
    storePath:
      getEnvString(env, 'HUB_SETTINGS_STORE_PATH') ??
      path.join(packageRoot, 'data/settings.json'),
    encryptionKey: getEnvString(env, 'HUB_SETTINGS_ENCRYPTION_KEY'),
    nativeAuth,
    database: nativeAuth.database,
    adminEmails,
    nocoBaseApiUrl,
    allowedRoles: parseRoles(
      getEnvString(env, 'HUB_SETTINGS_MANAGER_ROLES') ??
        getEnvString(env, 'HUB_RELEASE_MANAGER_ROLES'),
    ),
  });

  const appOptions: CreateAppOptions = {
    appName,
    basePath,
    browserBasePath,
    apiProxyPath,
    browserApiUrl: joinBasePath(browserBasePath, '/api'),
    clientHandler: viteDevUrl
      ? createOriginProxyHandler(viteDevUrl)
      : undefined,
    clientIndexPath:
      getEnvString(env, 'APP_CLIENT_INDEX') ??
      path.join(packageRoot, 'dist/client/index.html'),
    nocoBaseApiUrl,
    apiClientStoragePrefix: getEnvString(env, 'API_CLIENT_STORAGE_PREFIX'),
    apiClientStorageType: getEnvString(env, 'API_CLIENT_STORAGE_TYPE'),
    apiClientShareToken: getEnvBoolean(env, 'API_CLIENT_SHARE_TOKEN'),
    nativeAuth,
    apiPlugins: [releaseManagementPlugin],
    settings: { ...settingsManagement, defaultAppId: appName },
    appRuntimeGateway: {
      targetUrl: getEnvString(env, 'APP_HOST_GATEWAY_URL') ?? appHostUrl,
    },
  };

  return Object.assign(createApp(appOptions), {
    close: async (): Promise<void> => {
      try {
        await nativeAuth.close();
      } finally {
        await options.appHostRuntime?.close();
      }
    },
    ready: () => nativeAuth.ready(),
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
  const appHostRuntime = await startHubAppHostRuntime({
    env,
    packageRoot: getPackageRoot(),
  });
  let app: StandaloneServer;
  try {
    app = createStandaloneServer({
      appHostUrl: appHostRuntime.targetUrl,
      appHostRuntime,
    });
    await app.ready();
  } catch (error) {
    await appHostRuntime.close();
    throw error;
  }
  const host = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const port = numberFromEnv(env, 'APP_SERVER_PORT') ?? 13001;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: host,
      port,
    },
    (info) => {
      if (getEnvString(env, 'APP_SERVER_START_LOG') !== 'false') {
        console.log(
          `App server listening on http://${info.address}:${info.port}`,
        );
      }
    },
  );
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

function resolveAuthSecret(env: EnvMap): string {
  const secret = getEnvString(env, 'AUTH_SECRET');
  if (secret) return secret;
  if (getEnvString(env, 'NODE_ENV') === 'production') {
    throw new Error('AUTH_SECRET is required in production.');
  }
  return 'nocobase3-hub-development-only-secret-change-me';
}

function resolveAuthBaseUrl(
  env: EnvMap,
  host: string,
  port: number,
  basePath: string,
): string {
  const configured = getEnvString(env, 'NOCOBASE_AUTH_URL');
  if (configured) return configured;
  if (getEnvString(env, 'NODE_ENV') === 'production') {
    throw new Error('NOCOBASE_AUTH_URL is required in production.');
  }
  const resolvedHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const browserHost =
    resolvedHost.includes(':') && !resolvedHost.startsWith('[')
      ? `[${resolvedHost}]`
      : resolvedHost;
  return `http://${browserHost}:${port}${joinBasePath(basePath, '/api/auth')}`;
}

function numberFromEnv(env: EnvMap, name: string): number | undefined {
  const value = getEnvString(env, name);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveApiProxyPathFromEnv(env: EnvMap, basePath: string): string {
  return resolveApiProxyPath(
    getEnvString(env, 'NOCOBASE_API_URL') ??
      getEnvString(env, 'NOCOBASE_API_PROXY_PATH'),
    basePath,
  );
}

function parseRoles(value: string | undefined): string[] | undefined {
  const roles = value
    ?.split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  return roles?.length ? roles : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  const items = value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items?.length ? items : undefined;
}

if (isEntrypoint()) {
  startServer();
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return Boolean(
    entry && path.resolve(entry) === fileURLToPath(import.meta.url),
  );
}
