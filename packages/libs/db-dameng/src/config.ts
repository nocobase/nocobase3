import type { BaseConnectionConfig } from '@nocobase/db';

export interface DamengConnectionConfig extends BaseConnectionConfig {
  dialect: 'dameng';
  connectString?: string;
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  username?: string;
  password?: string;
  fetchAsString?: string[];
  fetchAsBuffer?: string[];
  compatible?: 'oracle' | 'mysql';
  parseJson?: boolean;
  sqlTransformer?: (sql: string) => string;
}
