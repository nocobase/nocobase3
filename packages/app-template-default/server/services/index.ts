import type { DatabaseManager } from '@nocobase/database';
import {
  createCacheManager,
  createNullCacheConfig,
  type AppCacheConfig,
  type NocoBaseCacheManager,
} from '@nocobase/cache';
import { createDriveManager, type AppDriveConfig } from '@nocobase/drive';
import {
  createLoggerManager,
  createSilentLoggerConfig,
  type AppLoggerConfig,
  type NocoBaseLoggerManager,
} from '@nocobase/logger';
import {
  createQueueManager,
  createSyncQueueConfig,
  type AppQueueConfig,
  type NocoBaseQueueManager,
} from '@nocobase/queue';
import {
  createNullSessionConfig,
  createSessionManager,
  type AppSessionConfig,
  type NocoBaseSessionManager,
} from '@nocobase/session';

import { createAppJobFactory } from '@/jobs/dependencies.js';
import {
  createNotificationModule,
  type NotificationModule,
  type NotificationModuleConfig,
} from '../../registry/notification/server/index.js';
import { createPortalLiveService, type PortalLiveService } from './portal-live.js';
import type { NotificationTemplateRegistry } from '../../registry/notification/templates/index.js';
import { AppSettingsService, UnavailableAppSettingsService, type AppSettings } from './app-settings-store.js';
import { FileUploadsService, UnavailableFileUploadsService, type FileUploads } from './public-file-storage.js';

export interface AppServices {
  appSettingsStore: AppSettings;
  cacheManager: NocoBaseCacheManager;
  publicFileStorage: FileUploads;
  loggerManager: NocoBaseLoggerManager;
  queueManager: NocoBaseQueueManager;
  sessionManager: NocoBaseSessionManager;
  portalLive?: PortalLiveService;
  notificationModule?: NotificationModule;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

export interface CreateAppServicesOptions {
  appId?: string;
  cache?: AppCacheConfig;
  database?: DatabaseManager;
  drive?: AppDriveConfig;
  logger?: AppLoggerConfig;
  queue?: AppQueueConfig;
  session?: AppSessionConfig;
  notifications?: NotificationModuleConfig;
  notificationTemplates?: NotificationTemplateRegistry;
}

export function createAppServices(options: CreateAppServicesOptions = {}): AppServices {
  const cacheManager = createCacheManager(options.cache ?? createNullCacheConfig());
  const driveManager = options.drive ? createDriveManager(options.drive) : undefined;
  const loggerManager = createLoggerManager(options.logger ?? createSilentLoggerConfig());
  const sessionManager = createSessionManager(options.session ?? createNullSessionConfig());
  const queueLogger = loggerManager.use().child({ module: 'queue' });
  const queueManager = createQueueManager(options.queue ?? createSyncQueueConfig(), {
    database: options.database,
    logger: queueLogger,
    jobFactory: createAppJobFactory({
      database: options.database,
      logger: queueLogger,
    }),
  });
  const portalLive = options.appId
    ? createPortalLiveService({
        appId: options.appId,
        sessionManager,
      })
    : undefined;
  const notificationModule = options.notifications?.enabled
    ? createNotificationModule({
        allowNonPersistentStore: options.notifications.allowNonPersistentStore,
        database: options.database,
        logger: loggerManager.use().child({ module: 'notification' }),
        queueManager,
        emailProviders: options.notifications.emailProviders,
        emailProviderDefinitions: options.notifications.emailProviderDefinitions,
        resolveUserEmail: options.notifications.resolveUserEmail,
        templates: options.notifications.templates ?? options.notificationTemplates,
        live: portalLive && options.appId
          ? { publisher: portalLive.publisher, appId: options.appId }
          : undefined,
      })
    : undefined;

  const services: AppServices = {
    appSettingsStore: options.database ? new AppSettingsService(options.database) : new UnavailableAppSettingsService(),
    cacheManager,
    publicFileStorage:
      driveManager && options.drive?.disks.public
        ? new FileUploadsService(driveManager)
        : new UnavailableFileUploadsService(resolveFileUploadsUnavailableMessage(options.drive)),
    loggerManager,
    queueManager,
    sessionManager,
    portalLive,
    notificationModule,
    start: () => notificationModule?.start() ?? Promise.resolve(),
    dispose: () =>
      disposeAppServices({
        cacheManager,
        loggerManager,
        notificationModule,
        portalLive,
        queueManager,
        sessionManager,
      }),
  };

  return services;
}

export async function disposeAppServices(
  services: Pick<AppServices, 'cacheManager' | 'loggerManager' | 'notificationModule' | 'portalLive' | 'queueManager' | 'sessionManager'>,
): Promise<void> {
  services.portalLive?.drain();
  services.notificationModule?.beginShutdown();
  await services.queueManager.close();
  await services.notificationModule?.close({ deadlineAt: Date.now() + 10_000 });
  await Promise.all([
    services.cacheManager.disconnectAll(),
    services.loggerManager.flushAll(),
    services.sessionManager.dispose(),
  ]);
}

function resolveFileUploadsUnavailableMessage(drive: AppDriveConfig | undefined): string {
  if (!drive) {
    return 'File drive is not configured.';
  }

  return 'Upload drive disk "public" is not configured.';
}

export { AppSettingsService, type AppSetting, type AppSettings } from './app-settings-store.js';
export { FileUploadsService, type FileUploads, type UploadResult } from './public-file-storage.js';
export { AppServiceError, BadRequestError, ServiceUnavailableError } from './errors.js';
