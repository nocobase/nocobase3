import { serve } from '@hono/node-server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getEnvString,
  readEnvFiles,
  type EnvMap,
} from '@nocobase/app-server/config';
import { createOriginProxyHandler } from '@nocobase/app-server/proxy';
import { joinBasePath, normalizeBasePath } from '@nocobase/app-server/support';

import { createApp } from './app.js';
import { createServiceDeskRuntime } from './runtime.js';
import { resolvePersistentAuthSecret } from './secret.js';

export function startServer(): void {
  void start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function start(): Promise<void> {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(serverDir, '../..');
  const env: EnvMap = {
    ...readEnvFiles(
      [path.join(packageRoot, '.env'), path.join(packageRoot, '.env.local')],
      process.env,
    ),
    ...process.env,
  };
  const appName = getEnvString(env, 'APP_NAME') ?? 'service-desk';
  const basePath = normalizeBasePath(
    getEnvString(env, 'APP_BASE_PATH') ?? `/${appName}`,
  );
  const host = getEnvString(env, 'APP_SERVER_HOST') ?? '127.0.0.1';
  const port = Number(getEnvString(env, 'APP_SERVER_PORT') ?? 13020);
  const dataDir =
    getEnvString(env, 'SERVICE_DESK_DATA_DIR') ??
    path.join(packageRoot, 'data');
  const runtime = createServiceDeskRuntime({
    appName,
    authBasePath: joinBasePath(basePath, '/api/auth'),
    authSecret: resolvePersistentAuthSecret(
      dataDir,
      getEnvString(env, 'AUTH_SECRET'),
    ),
    baseURL:
      getEnvString(env, 'NOCOBASE_AUTH_URL') ??
      `http://${host}:${port}${joinBasePath(basePath, '/api/auth')}`,
    databasePath:
      getEnvString(env, 'SERVICE_DESK_DATABASE_PATH') ??
      path.join(dataDir, 'service-desk.sqlite'),
    migrationsDirectory: path.join(serverDir, 'migrations'),
    seedsDirectory: path.join(serverDir, 'seed'),
    publicBasePath: basePath,
  });
  await runtime.ready();
  const viteUrl = getEnvString(env, 'APP_VITE_DEV_URL');
  const app = createApp({
    appName,
    basePath,
    browserBasePath: basePath,
    browserApiUrl: joinBasePath(basePath, '/api'),
    apiProxyPath: joinBasePath(basePath, '/api'),
    clientHandler: viteUrl
      ? createOriginProxyHandler(new URL(viteUrl))
      : undefined,
    clientIndexPath: path.join(packageRoot, 'dist/client/index.html'),
    serviceDeskRuntime: runtime,
  });
  const server = serve({ fetch: app.fetch, hostname: host, port }, () =>
    console.log(`Service desk app: http://${host}:${port}${basePath}/`),
  );
  const close = (): void => {
    server.close(() => void runtime.close());
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startServer();
}
