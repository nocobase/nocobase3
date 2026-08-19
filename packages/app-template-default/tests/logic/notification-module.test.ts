// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { createCacheManager, createNullCacheConfig } from '@nocobase/cache';
import { createDatabaseManager } from '@nocobase/database';
import { createLoggerManager, createSilentLoggerConfig } from '@nocobase/logger';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { createNullSessionConfig, createSessionManager } from '@nocobase/session';

import { createApp } from '../../server/app.ts';
import { disposeAppServices } from '../../server/services/index.ts';
import { createNotificationModule } from '../../registry/notification/server/index.ts';

describe('notification module lifecycle', () => {
  it('requires a database unless non-persistent development use is explicit', () => {
    const queueManager = createQueueManagerStub();
    const loggerManager = createLoggerManager(createSilentLoggerConfig());

    expect(() => createNotificationModule({ queueManager, logger: loggerManager.use() })).toThrowError(
      expect.objectContaining({ code: 'NOTIFICATION_PERSISTENT_STORE_REQUIRED' }),
    );
  });

  it('initializes shared queue infrastructure once without taking ownership of it', async () => {
    const queueManager = createQueueManagerStub();
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const database = createTestDatabase();
    const module = createNotificationModule({
      database,
      queueManager,
      logger: loggerManager.use(),
    });

    await Promise.all([module.start(), module.start()]);
    const [first, second] = await Promise.all([
      module.close({ deadlineAt: Date.now() + 1_000 }),
      module.close({ deadlineAt: Date.now() + 1_000 }),
    ]);

    expect(queueManager.init).toHaveBeenCalledTimes(1);
    expect(queueManager.close).not.toHaveBeenCalled();
    expect(first).toBe(second);
    await expect(module.health()).resolves.toEqual({
      status: 'ok',
      persistence: 'database',
      queue: 'ok',
      started: true,
      closed: true,
    });

    await queueManager.close();
    await database.destroy();
    await loggerManager.flushAll();
  });

  it('closes the notification module before shared queue infrastructure', async () => {
    const calls: string[] = [];
    const queueManager = createQueueManagerStub();
    const loggerManager = createLoggerManager(createSilentLoggerConfig());
    const database = createTestDatabase();
    const notificationModule = createNotificationModule({
      database,
      queueManager,
      logger: loggerManager.use(),
    });
    vi.spyOn(notificationModule, 'close').mockImplementation(async () => {
      calls.push('notification');
      return { status: 'closed', errors: [] };
    });
    queueManager.close.mockImplementation(async () => {
      calls.push('queue');
    });

    await disposeAppServices({
      cacheManager: createCacheManager(createNullCacheConfig()),
      loggerManager,
      notificationModule,
      queueManager,
      sessionManager: createSessionManager(createNullSessionConfig()),
    });

    expect(calls).toEqual(['notification', 'queue']);
    await database.destroy();
  });
});

describe('notification app mount', () => {
  it('fails construction when notifications are enabled without a database', () => {
    expect(() => createApp({ nocoBaseApiUrl: false, notifications: { enabled: true } })).toThrowError(
      expect.objectContaining({ code: 'NOTIFICATION_PERSISTENT_STORE_REQUIRED' }),
    );
  });

  it('mounts the disabled HTTP trigger at the app-local notification path', async () => {
    const database = createTestDatabase();
    const app = createApp({
      database,
      nocoBaseApiUrl: false,
      notifications: { enabled: true },
    });

    const response = await app.request('http://localhost/api/notifications/trigger', { method: 'POST' });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'HTTP_TRIGGER_DISABLED',
        message: 'HTTP notification triggering is disabled.',
        requestId: expect.any(String),
      },
    });

    await app.close();
    await database.destroy();
  });
});

function createTestDatabase(): ReturnType<typeof createDatabaseManager> {
  return createDatabaseManager({
    default: 'sqlite',
    connections: { sqlite: { dialect: 'sqlite', filename: ':memory:' } },
  });
}

function createQueueManagerStub(): NocoBaseQueueManager & {
  init: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    init: vi.fn(async (): Promise<void> => undefined),
    use: vi.fn(),
    registerJob: vi.fn(),
    dispatch: vi.fn(),
    dispatchMany: vi.fn(),
    createWorker: vi.fn(),
    close: vi.fn(async (): Promise<void> => undefined),
  };
}
