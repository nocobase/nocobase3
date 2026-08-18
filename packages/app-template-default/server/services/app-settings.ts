import type { DatabaseManager, Row } from '@nocobase/database';

const appSettingsTable = 'appSettings';
const appSettingsColumns = ['key', 'value', 'createdAt', 'updatedAt'] as const;

export interface AppSetting {
  key: string;
  value: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

interface AppSettingRecord extends Row {
  key: string;
  value: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export class AppSettingsService {
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
