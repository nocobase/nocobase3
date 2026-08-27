import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import type { AppConfig } from '../config/index.js';
import type { RealtimeService } from '../realtime/service.js';
import {
  AppSettingsService,
  UnavailableAppSettingsService,
  type AppSettings,
} from './app-settings-store.js';

export interface AppServices {
  appSettingsStore: AppSettings;
  realtime: RealtimeService;
}

export interface CreateAppServicesOptions {
  realtime: RealtimeService;
}

export function createAppServices(
  runtime: AppRuntime<AppConfig>,
  options: CreateAppServicesOptions,
): AppServices {
  return {
    appSettingsStore: runtime.database
      ? new AppSettingsService(runtime.database)
      : new UnavailableAppSettingsService(),
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
