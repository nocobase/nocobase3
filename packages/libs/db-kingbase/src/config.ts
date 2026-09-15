import type { BaseConnectionConfig } from '@nocobase/db';

export interface KingbaseConnectionConfig extends BaseConnectionConfig {
  dialect: 'kingbase';
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}
