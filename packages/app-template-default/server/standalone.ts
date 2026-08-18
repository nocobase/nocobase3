import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAppRuntime, type AppRuntime } from '@nocobase/app-server/runtime';

import type { AppConfig } from './config/index.js';
import { createAppFromRuntime, loadStandaloneAppConfig, mountAppAtPublicBasePath, prepareAppRuntime } from './runtime/index.js';

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
}

export function createStandaloneServer(options: StandaloneServerOptions = {}): Hono {
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
  await prepareAppRuntime(runtime);
  const app = createStandaloneAppFromRuntime(runtime);
  const { config } = runtime;

  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.server.host,
      port: config.server.port,
    },
    (info) => {
      if (config.server.startLog) {
        console.log(`App server listening on http://${info.address}:${info.port}`);
      }
    },
  );

  registerShutdownHandlers(runtime, server);
}

export function createStandaloneRuntime(): AppRuntime<AppConfig> {
  return createAppRuntime(loadStandaloneAppConfig(import.meta.url));
}

function createStandaloneAppFromRuntime(
  runtime: AppRuntime<AppConfig>,
  options: StandaloneServerOptions = {},
): Hono {
  const app = createAppFromRuntime(runtime, options);
  return mountAppAtPublicBasePath(app, runtime.config.app.publicBasePath);
}

function registerShutdownHandlers(runtime: AppRuntime<AppConfig>, server: ReturnType<typeof serve>): void {
  const shutdown = async (): Promise<void> => {
    await runtime.dispose();
    server.close();
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
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
