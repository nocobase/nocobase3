import { serve } from '@hono/node-server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAppRuntime, type AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from './config/index.js';
import type { ClosableApp } from './app.js';
import { createAppFromRuntime, loadStandaloneAppConfig, mountAppAtPublicBasePath, prepareAppRuntime } from './runtime/index.js';

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
}

export interface StandaloneServer extends ClosableApp {}

export function createStandaloneServer(options: StandaloneServerOptions = {}): StandaloneServer {
  const runtime = createStandaloneRuntime();
  return createStandaloneAppFromRuntime(runtime, options);
}

export function startServer(): void {
  void startServerAsync().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function startServerAsync(): Promise<void> {
  const runtime = createStandaloneRuntime();
  let app: StandaloneServer | undefined;
  try {
    await prepareAppRuntime(runtime);
    app = createStandaloneAppFromRuntime(runtime);
    await app.start();
  } catch (error: unknown) {
    if (app) {
      await app.close();
    } else {
      await runtime.dispose();
    }
    throw error;
  }
  const { config } = runtime;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.server.host,
      port: config.server.port,
      websocket: {
        server: app.websocketServer,
      },
    },
    (info) => {
      if (config.server.startLog) {
        console.log(`App server listening on http://${info.address}:${info.port}`);
      }
    },
  );

  registerShutdownHandlers(app, server);
}

export function createStandaloneRuntime(): AppRuntime<AppConfig> {
  return createAppRuntime(loadStandaloneAppConfig(import.meta.url));
}

function createStandaloneAppFromRuntime(
  runtime: AppRuntime<AppConfig>,
  options: StandaloneServerOptions = {},
): StandaloneServer {
  const app = createAppFromRuntime(runtime, options);
  const mounted = mountAppAtPublicBasePath(app, runtime.config.app.publicBasePath);
  const closeApp = mounted.close;
  const close = onceAsync(async () => {
    await closeApp();
    await runtime.dispose();
  });

  return Object.assign(mounted, { close });
}

function registerShutdownHandlers(app: ClosableApp, server: ReturnType<typeof serve>): void {
  const shutdown = async (): Promise<void> => {
    await app.close();
    server.close();
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

function onceAsync(dispose: () => void | Promise<void>): () => Promise<void> {
  let promise: Promise<void> | undefined;

  return () => {
    promise ??= Promise.resolve().then(dispose);
    return promise;
  };
}

if (isEntrypoint()) {
  startServer();
}

function isEntrypoint(): boolean {
  const modulePath = fileURLToPath(import.meta.url);
  const entry = process.argv[1];
  const pm2Entry = process.env.pm_exec_path;

  return Boolean(
    (entry && path.resolve(entry) === modulePath) ||
      (pm2Entry && path.resolve(pm2Entry) === modulePath),
  );
}
