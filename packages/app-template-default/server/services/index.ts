import type { AppRuntime } from '@nocobase/app-server/runtime';
import type { AppDriveConfig } from '@nocobase/drive';

import type { AppConfig } from '../config/index.js';
import type { AppDeps } from '../runtime/deps.js';
import { AppSettingsService, UnavailableAppSettingsService, type AppSettings } from './app-settings-store.js';
import { FileUploadsService, UnavailableFileUploadsService, type FileUploads } from './public-file-storage.js';

export interface AppServices {
  appSettingsStore: AppSettings;
  publicFileStorage: FileUploads;
}

export function createAppServices(runtime: AppRuntime<AppConfig>, deps: AppDeps): AppServices {
  return {
    appSettingsStore: runtime.database ? new AppSettingsService(runtime.database) : new UnavailableAppSettingsService(),
    publicFileStorage:
      deps.driveManager && runtime.config.drive?.disks.public
        ? new FileUploadsService(deps.driveManager)
        : new UnavailableFileUploadsService(resolveFileUploadsUnavailableMessage(runtime.config.drive)),
  };
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
