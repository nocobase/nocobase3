import { serve } from '@hono/node-server';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  createAppRuntime,
  type AppRuntime,
} from '@nocobase/app-server-kit/runtime';
import {
  acceptWebSocketUpgrade,
  createWebSocketUpgradeRequest,
  isWebSocketUpgrade,
  rejectWebSocketUpgrade,
} from '@nocobase/app-server-kit/websocket';

import type { AppServer } from './app.js';
import type { AppConfig } from './config/index.js';
import {
  createAppDisposerRegistry,
  createAppFromRuntime,
  createPublicBasePathAdapter,
  loadAppConfig,
  createRuntimeConfigPaths,
  resolveStandaloneRuntimeOptions,
  type AppDisposerRegistry,
} from './runtime/index.js';

const HTTP_DRAIN_TIMEOUT_MS = 30_000;
const FORCE_EXIT_TIMEOUT_MS = 35_000;

interface NodeHttpConnectionControls {
  closeAllConnections?(): void;
  closeIdleConnections?(): void;
}

export interface StandaloneServerOptions {
  viteDevUrl?: string | false;
}

export interface StandaloneServerListenOptions {
  readonly hostname: string;
  readonly port: number;
  readonly startLog: boolean;
}

export interface StandaloneServer extends AppServer {
  readonly listenOptions: StandaloneServerListenOptions;
  readonly signal: AbortSignal;
  close(): Promise<void>;
}

export async function createStandaloneServer(
  options: StandaloneServerOptions = {},
): Promise<StandaloneServer> {
  const lifecycle = createAppDisposerRegistry();

  try {
    const runtime = createStandaloneRuntime();
    const websocketAbortController = new AbortController();

    const app = await createStandaloneAppFromRuntime(
      runtime,
      lifecycle,
      websocketAbortController.signal,
      options,
    );
    lifecycle.registerDisposer('websocket-connections', () => {
      websocketAbortController.abort(new Error('app server closed'));
    });

    return app;
  } catch (error) {
    return disposeAfterStartupFailure(() => lifecycle.disposeAll(), error);
  }
}

export function startServer(): void {
  const startPromise = startServerAsync();
  startPromise.catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function startServerAsync(): Promise<void> {
  const app = await createStandaloneServer();

  try {
    const server = serve(
      {
        fetch: app.fetch,
        hostname: app.listenOptions.hostname,
        port: app.listenOptions.port,
      },
      (info) => {
        if (app.listenOptions.startLog) {
          console.log(
            `App server listening on http://${info.address}:${info.port}`,
          );
        }
      },
    );

    registerStandaloneWebSocketUpgradeHandler(app, server);
    registerShutdownHandlers(app, server);
  } catch (error) {
    await disposeAfterStartupFailure(() => app.close(), error);
  }
}

export function createStandaloneRuntime(): AppRuntime<AppConfig> {
  const options = resolveStandaloneRuntimeOptions(import.meta.url);
  return createAppRuntime(loadAppConfig(options), {
    paths: createRuntimeConfigPaths(options.paths),
  });
}

async function createStandaloneAppFromRuntime(
  runtime: AppRuntime<AppConfig>,
  lifecycle: AppDisposerRegistry,
  signal: AbortSignal,
  options: StandaloneServerOptions = {},
): Promise<StandaloneServer> {
  const app = await createAppFromRuntime(runtime, {
    ...options,
    lifecycle,
  });
  const mounted = createPublicBasePathAdapter(
    app,
    runtime.config.app.publicBasePath,
  );

  return Object.assign(mounted, {
    listenOptions: {
      hostname: runtime.config.server.host,
      port: runtime.config.server.port,
      startLog: runtime.config.server.startLog,
    },
    signal,
    close: () => lifecycle.disposeAll(),
  });
}

export function registerStandaloneWebSocketUpgradeHandler(
  app: StandaloneServer,
  server: ReturnType<typeof serve>,
): void {
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const dispatchPromise = dispatchStandaloneWebSocket(req, socket, head, app);
    dispatchPromise.catch((error) => {
      console.error(error);
      rejectWebSocketUpgrade(socket, 500);
    });
  });
}

async function dispatchStandaloneWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  app: StandaloneServer,
): Promise<void> {
  if (!isWebSocketUpgrade(req)) {
    rejectWebSocketUpgrade(socket, 400);
    return;
  }

  const websocket = app.websocket;
  if (!websocket) {
    rejectWebSocketUpgrade(socket, 404);
    return;
  }

  const request = createWebSocketUpgradeRequest(req, {
    signal: app.signal,
  });
  const result = await websocket(request, {
    signal: app.signal,
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
    signal: app.signal,
  });
}

function registerShutdownHandlers(
  app: StandaloneServer,
  server: ReturnType<typeof serve>,
): void {
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;

  const handleShutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      console.error(
        `Received ${signal} during app server shutdown; forcing exit.`,
      );
      closeAllConnections(server);
      process.exit(1);
    }

    shuttingDown = true;
    shutdownPromise ??= shutdownAppServer(app, server, signal);
    void shutdownPromise.catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

async function shutdownAppServer(
  app: StandaloneServer,
  server: ReturnType<typeof serve>,
  signal: NodeJS.Signals,
): Promise<void> {
  const forceExitTimer = setTimeout(() => {
    console.error(
      `App server shutdown after ${signal} exceeded ${FORCE_EXIT_TIMEOUT_MS}ms; forcing exit.`,
    );
    closeAllConnections(server);
    process.exit(1);
  }, FORCE_EXIT_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    await closeServerWithGracePeriod(server, HTTP_DRAIN_TIMEOUT_MS);
  } finally {
    try {
      await app.close();
    } finally {
      clearTimeout(forceExitTimer);
    }
  }
}

async function closeServerWithGracePeriod(
  server: ReturnType<typeof serve>,
  timeoutMs: number,
): Promise<void> {
  const closePromise = closeServer(server);
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;

  closeIdleConnections(server);

  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(() => {
      timedOut = true;
      console.error(
        `HTTP server did not drain within ${timeoutMs}ms; closing active connections.`,
      );
      closeAllConnections(server);
      resolve();
    }, timeoutMs);
    timeout.unref();
  });

  try {
    await Promise.race([closePromise, timeoutPromise]);

    if (timedOut) {
      closePromise.catch((error) => {
        console.error(
          'HTTP server close failed after the drain timeout.',
          error,
        );
      });
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function closeIdleConnections(server: ReturnType<typeof serve>): void {
  getNodeHttpConnectionControls(server).closeIdleConnections?.();
}

function closeAllConnections(server: ReturnType<typeof serve>): void {
  getNodeHttpConnectionControls(server).closeAllConnections?.();
}

function getNodeHttpConnectionControls(
  server: ReturnType<typeof serve>,
): NodeHttpConnectionControls {
  return server as unknown as NodeHttpConnectionControls;
}

function closeServer(server: ReturnType<typeof serve>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function disposeAfterStartupFailure(
  dispose: () => Promise<void>,
  startupError: unknown,
): Promise<never> {
  try {
    await dispose();
  } catch (disposeError) {
    throw new AggregateError(
      [startupError, disposeError],
      'Failed to start server and dispose resources',
      { cause: disposeError },
    );
  }

  throw startupError;
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
