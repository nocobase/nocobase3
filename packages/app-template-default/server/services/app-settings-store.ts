import type { DatabaseManager, Row } from '@nocobase/app-database';

import { ServiceUnavailableError } from './errors.js';

const appSettingsTable = 'appSettings';
const appSettingsColumns = ['key', 'value', 'createdAt', 'updatedAt'] as const;

export interface AppSetting {
  key: string;
  value: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface AppSettings {
  all(): Promise<AppSetting[]>;
}

interface AppSettingRecord extends Row {
  key: string;
  value: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export class AppSettingsService implements AppSettings {
  constructor(private readonly database: DatabaseManager) {}

  async all(): Promise<AppSetting[]> {
    return this.database
      .query()
      .selectFrom<AppSettingRecord>(appSettingsTable)
      .select(appSettingsColumns)
      .orderBy('key')
      .execute<AppSetting>();
  }
}

export class UnavailableAppSettingsService implements AppSettings {
  async all(): Promise<AppSetting[]> {
    throw new ServiceUnavailableError('Database is not configured.');
  }
}
