import type { BaseConnectionConfig } from '@nocobase/db';

export type MssqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mssql';
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
};
