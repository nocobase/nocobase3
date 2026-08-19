import { randomUUID } from 'node:crypto';

import type { DatabaseManager } from '@nocobase/database';
import type { NocoBaseLogger } from '@nocobase/logger';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { Hono } from 'hono';
import {
  createDatabaseNotificationStore,
  createMemoryNotificationStore,
  type NotificationStore,
} from './domain.js';

export * from './domain.js';

export type NotificationHealthStatus = 'ok' | 'degraded' | 'unavailable';

export interface NotificationCloseOptions {
  readonly deadlineAt: number;
}

export interface NotificationCloseResult {
  readonly status: 'closed';
  readonly errors: readonly string[];
}

export interface NotificationHealth {
  readonly status: NotificationHealthStatus;
  readonly persistence: 'database' | 'memory';
  readonly queue: NotificationHealthStatus;
  readonly started: boolean;
  readonly closed: boolean;
}

export interface NotificationService {
  readonly store: NotificationStore;
}

export interface NotificationModule {
  readonly service: NotificationService;
  readonly router: Hono;
  health(): Promise<NotificationHealth>;
  start(): Promise<void>;
  close(options: NotificationCloseOptions): Promise<NotificationCloseResult>;
}

export interface CreateNotificationModuleOptions {
  readonly database?: DatabaseManager;
  readonly queueManager: NocoBaseQueueManager;
  readonly logger: NocoBaseLogger;
  readonly allowNonPersistentStore?: boolean;
}

export interface NotificationModuleConfig {
  readonly enabled?: boolean;
  readonly allowNonPersistentStore?: boolean;
}

export class NotificationModuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationModuleError';
  }
}

export function createNotificationModule(options: CreateNotificationModuleOptions): NotificationModule {
  if (!options.database && !options.allowNonPersistentStore) {
    throw new NotificationModuleError(
      'NOTIFICATION_PERSISTENT_STORE_REQUIRED',
      'A DatabaseManager is required unless non-persistent development use is explicit.',
    );
  }

  const router = createNotificationRouter();
  const service: NotificationService = {
    store: options.database
      ? createDatabaseNotificationStore(options.database)
      : createMemoryNotificationStore(),
  };
  let started = false;
  let closed = false;
  let queueStatus: NotificationHealthStatus = 'degraded';
  let startPromise: Promise<void> | undefined;
  let closePromise: Promise<NotificationCloseResult> | undefined;

  return {
    service,
    router,
    async health(): Promise<NotificationHealth> {
      return {
        status: queueStatus,
        persistence: options.database ? 'database' : 'memory',
        queue: queueStatus,
        started,
        closed,
      };
    },
    start(): Promise<void> {
      if (closed) {
        return Promise.reject(
          new NotificationModuleError('NOTIFICATION_MODULE_CLOSED', 'The notification module is already closed.'),
        );
      }

      startPromise ??= options.queueManager.init().then(() => {
        started = true;
        queueStatus = 'ok';
        options.logger.info({ module: 'notification' }, 'Notification module started');
      });
      return startPromise;
    },
    close(_closeOptions: NotificationCloseOptions): Promise<NotificationCloseResult> {
      closePromise ??= Promise.resolve(startPromise)
        .catch(() => undefined)
        .then(() => {
        closed = true;
        options.logger.info({ module: 'notification' }, 'Notification module closed');
        return { status: 'closed' as const, errors: [] };
      });
      return closePromise;
    },
  };
}

function createNotificationRouter(): Hono {
  const router = new Hono();

  router.post('/trigger', (context) =>
    context.json(
      {
        error: {
          code: 'HTTP_TRIGGER_DISABLED',
          message: 'HTTP notification triggering is disabled.',
          requestId: context.req.header('x-request-id') ?? randomUUID(),
        },
      },
      403,
    ),
  );

  return router;
}
