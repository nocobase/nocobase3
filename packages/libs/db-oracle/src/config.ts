import type { BaseConnectionConfig } from '@nocobase/db';

export type OracleConnectionConfig = BaseConnectionConfig & {
  dialect: 'oracle';
  serviceName: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};
