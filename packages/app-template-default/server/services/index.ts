import type { DatabaseManager } from '@nocobase/database';

import { AppSettingsService } from './app-settings.js';

export interface AppServices {
  appSettings?: AppSettingsService;
}

export interface CreateAppServicesOptions {
  database?: DatabaseManager;
}

export function createAppServices(options: CreateAppServicesOptions = {}): AppServices {
  return {
    appSettings: options.database ? new AppSettingsService(options.database) : undefined,
  };
}

export { AppSettingsService, type AppSetting } from './app-settings.js';
