import type { BaseConnectionConfig } from '@nocobase/db';

export interface SqliteConnectionConfig extends BaseConnectionConfig {
  dialect: 'sqlite';
  filename: string;
}
