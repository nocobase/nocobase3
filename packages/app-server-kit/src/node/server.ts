import { serve, type ServerType } from '@hono/node-server';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';

import type { AppServer } from '../runtime/index.js';
import {
  acceptWebSocketUpgrade,
  createWebSocketUpgradeRequest,
  isWebSocketUpgrade,
  rejectWebSocketUpgrade,
} from '../websocket.js';

export const DEFAULT_HTTP_DRAIN_TIMEOUT_MS: number = 30_000;
export const DEFAULT_FORCE_EXIT_TIMEOUT_MS: number = 35_000;

export type NodeAppHttpServer = ServerType;

export interface ClosableNodeAppServer extends AppServer {
  readonly signal?: AbortSignal;
  close(): Promise<void>;
}

export interface NodeAppServerLogger {
  error(message: string, error?: unknown): void;
}

export interface StartNodeAppServerOptions {
  readonly hostname: string;
  readonly port: number;
  readonly onListen?: (info: AddressInfo) => void;
  readonly logger?: NodeAppServerLogger;
  readonly registerProcessSignals?: boolean;
  readonly httpDrainTimeoutMs?: number;
  readonly forceExitTimeoutMs?: number;
}

export interface NodeShutdownOptions {
  readonly logger?: NodeAppServerLogger;
  readonly httpDrainTimeoutMs?: number;
  readonly forceExitTimeoutMs?: number;
}

const defaultLogger: NodeAppServerLogger = {
  error: (message: string, error?: unknown): void => {
    if (error === undefined) {
      console.error(message);
      return;
    }

    console.error(message, error);
  },
};

export function startNodeAppServer(
  app: ClosableNodeAppServer,
  options: StartNodeAppServerOptions,
): Promise<NodeAppHttpServer> {
  const logger = options.logger ?? defaultLogger;

  return new Promise<NodeAppHttpServer>((resolve, reject) => {
    let listening = false;
    let unregisterShutdownHandlers = (): void => undefined;
    const server = serve(
      {
        fetch: app.fetch,
        hostname: options.hostname,
        port: options.port,
      },
      (info) => {
        listening = true;
        try {
          options.onListen?.(info);
          resolve(server);
        } catch (error) {
          const listenError = toError(error);
          unregisterShutdownHandlers();
          closeNodeServer(server).then(
            () => reject(listenError),
            (closeError) =>
              reject(
                new AggregateError(
                  [listenError, closeError],
                  'Node app server listen callback and cleanup failed',
                  { cause: closeError },
                ),
              ),
          );
        }
      },
    );

    server.on('error', (error) => {
      if (!listening) {
        unregisterShutdownHandlers();
        reject(toError(error));
        return;
      }

      logger.error('Node app server failed after it started.', error);
      process.exitCode = 1;
    });
    registerNodeWebSocketUpgradeHandler(app, server, { logger });
    if (options.registerProcessSignals !== false) {
      unregisterShutdownHandlers = registerNodeShutdownHandlers(
        app,
        server,
        options,
      );
    }
  });
}

export function registerNodeWebSocketUpgradeHandler(
  app: AppServer,
  server: NodeAppHttpServer,
  options: { readonly logger?: NodeAppServerLogger } = {},
): void {
  const logger = options.logger ?? defaultLogger;
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const dispatchPromise = dispatchNodeWebSocket(req, socket, head, app);
    dispatchPromise.catch((error) => {
      logger.error('WebSocket upgrade dispatch failed.', error);
      rejectWebSocketUpgrade(socket, 500);
    });
  });
}

export function registerNodeShutdownHandlers(
  app: ClosableNodeAppServer,
  server: NodeAppHttpServer,
  options: NodeShutdownOptions = {},
): () => void {
  const logger = options.logger ?? defaultLogger;
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | undefined;

  const handleShutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      logger.error(
        `Received ${signal} during app server shutdown; forcing exit.`,
      );
      closeAllConnections(server);
      process.exit(1);
    }

    shuttingDown = true;
    shutdownPromise ??= shutdownNodeAppServer(app, server, signal, options);
    void shutdownPromise
      .catch((error) => {
        logger.error('App server shutdown failed.', error);
        process.exitCode = 1;
      })
      .finally(unregister);
  };
  const handleSigint = (): void => handleShutdown('SIGINT');
  const handleSigterm = (): void => handleShutdown('SIGTERM');
  const handleServerClose = (): void => {
    if (!shuttingDown) unregister();
  };
  const unregister = (): void => {
    process.off('SIGINT', handleSigint);
    process.off('SIGTERM', handleSigterm);
    server.off('close', handleServerClose);
  };

  process.on('SIGINT', handleSigint);
  process.on('SIGTERM', handleSigterm);
  server.once('close', handleServerClose);
  return unregister;
}

export async function shutdownNodeAppServer(
  app: ClosableNodeAppServer,
  server: NodeAppHttpServer,
  signal: NodeJS.Signals,
  options: NodeShutdownOptions = {},
): Promise<void> {
  const logger = options.logger ?? defaultLogger;
  const forceExitTimeoutMs =
    options.forceExitTimeoutMs ?? DEFAULT_FORCE_EXIT_TIMEOUT_MS;
  const forceExitTimer = setTimeout(() => {
    logger.error(
      `App server shutdown after ${signal} exceeded ${forceExitTimeoutMs}ms; forcing exit.`,
    );
    closeAllConnections(server);
    process.exit(1);
  }, forceExitTimeoutMs);
  forceExitTimer.unref();

  try {
    await closeNodeServerWithGracePeriod(
      server,
      options.httpDrainTimeoutMs ?? DEFAULT_HTTP_DRAIN_TIMEOUT_MS,
      logger,
    );
  } finally {
    try {
      await app.close();
    } finally {
      clearTimeout(forceExitTimer);
    }
  }
}

export async function closeNodeServerWithGracePeriod(
  server: NodeAppHttpServer,
  timeoutMs: number,
  logger: NodeAppServerLogger = defaultLogger,
): Promise<void> {
  const closePromise = closeNodeServer(server);
  let timeout: NodeJS.Timeout | undefined;
  let timedOut = false;

  closeIdleConnections(server);

  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(() => {
      timedOut = true;
      logger.error(
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
        logger.error(
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

export function closeNodeServer(server: NodeAppHttpServer): Promise<void> {
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

export async function disposeAfterStartupFailure(
  dispose: () => void | Promise<void>,
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

async function dispatchNodeWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  app: AppServer,
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

  const signal =
    'signal' in app && app.signal instanceof AbortSignal
      ? app.signal
      : undefined;
  const request = createWebSocketUpgradeRequest(req, { signal });
  const result = await websocket(request, { signal });

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
    signal,
  });
}

function closeIdleConnections(server: NodeAppHttpServer): void {
  if (
    'closeIdleConnections' in server &&
    typeof server.closeIdleConnections === 'function'
  ) {
    server.closeIdleConnections();
  }
}

function closeAllConnections(server: NodeAppHttpServer): void {
  if (
    'closeAllConnections' in server &&
    typeof server.closeAllConnections === 'function'
  ) {
    server.closeAllConnections();
  }
}

function toError(value: unknown): Error {
  return value instanceof Error
    ? value
    : new Error(String(value), { cause: value });
}
