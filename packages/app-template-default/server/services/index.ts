import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import {
  createFileService,
  type FileService,
} from '@nocobase/app-plugin-files/server';

import type { AppConfig } from '../config/index.js';
import type { RealtimeService } from '../realtime/service.js';
import type { AppDeps } from '../runtime/deps.js';
import {
  AppSettingsService,
  UnavailableAppSettingsService,
  type AppSettings,
} from './app-settings-store.js';

export interface AppServices {
  appSettingsStore: AppSettings;
  fileService?: FileService;
  realtime: RealtimeService;
}

export interface CreateAppServicesOptions {
  realtime: RealtimeService;
}

export function createAppServices(
  runtime: AppRuntime<AppConfig>,
  deps: AppDeps,
  options: CreateAppServicesOptions,
): AppServices {
  return {
    appSettingsStore: runtime.database
      ? new AppSettingsService(runtime.database)
      : new UnavailableAppSettingsService(),
    fileService: deps.filesRuntime
      ? createFileService({
          runtime: deps.filesRuntime,
          publicBasePath: runtime.config.app.publicBasePath,
        })
      : undefined,
    realtime: options.realtime,
  };
}

export {
  AppSettingsService,
  type AppSetting,
  type AppSettings,
} from './app-settings-store.js';
export {
  AppServiceError,
  BadRequestError,
  ServiceUnavailableError,
} from './errors.js';
