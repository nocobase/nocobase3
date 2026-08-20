import type { AppRuntime } from '@nocobase/app-server/runtime';
import type { AppDriveConfig } from '@nocobase/drive';

import type { AppConfig } from '../config/index.js';
import type { AppDeps } from '../runtime/deps.js';
import {
  createNotificationModule,
  type NotificationModule,
} from '../../registry/notification/server/index.js';
import { createPortalLiveService, type PortalLiveService } from './portal-live.js';
import { AppSettingsService, UnavailableAppSettingsService, type AppSettings } from './app-settings-store.js';
import { FileUploadsService, UnavailableFileUploadsService, type FileUploads } from './public-file-storage.js';

export interface AppServices {
  appSettingsStore: AppSettings;
  publicFileStorage: FileUploads;
  portalLive: PortalLiveService;
  notificationModule?: NotificationModule;
  start(): Promise<void>;
  dispose(): Promise<void>;
}

export function createAppServices(runtime: AppRuntime<AppConfig>, deps: AppDeps): AppServices {
  const notification = runtime.config.notification;
  const portalLive = createPortalLiveService({
    appId: runtime.config.app.name,
    sessionManager: deps.sessionManager,
  });
  const notificationModule = notification?.enabled
    ? createNotificationModule({
        allowNonPersistentStore: notification.allowNonPersistentStore,
        database: runtime.database,
        logger: deps.loggerManager.use().child({ module: 'notification' }),
        queueManager: deps.queueManager,
        emailProviders: notification.emailProviders,
        emailProviderDefinitions: notification.emailProviderDefinitions,
        resolveUserEmail: notification.resolveUserEmail,
        templates: notification.templates,
        live: {
          publisher: portalLive.publisher,
          appId: runtime.config.app.name,
        },
      })
    : undefined;

  return {
    appSettingsStore: runtime.database ? new AppSettingsService(runtime.database) : new UnavailableAppSettingsService(),
    publicFileStorage:
      deps.driveManager && runtime.config.drive?.disks.public
        ? new FileUploadsService(deps.driveManager)
        : new UnavailableFileUploadsService(resolveFileUploadsUnavailableMessage(runtime.config.drive)),
    portalLive,
    notificationModule,
    start: (): Promise<void> => notificationModule?.start() ?? Promise.resolve(),
    dispose: (): Promise<void> => disposeAppServices({ notificationModule, portalLive }),
  };
}

export async function disposeAppServices(
  services: Pick<AppServices, 'notificationModule' | 'portalLive'>,
): Promise<void> {
  services.portalLive.drain();
  services.notificationModule?.beginShutdown();
  await services.notificationModule?.close({ deadlineAt: Date.now() + 10_000 });
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
