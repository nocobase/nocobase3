import type { BaseConnectionConfig } from '@nocobase/db';

export type PostgresConnectionConfig = BaseConnectionConfig & {
  dialect: 'postgres';
  schema?: string | readonly string[];
  ssl?: boolean | Record<string, unknown>;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
};
