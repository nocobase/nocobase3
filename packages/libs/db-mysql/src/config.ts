import type { BaseConnectionConfig } from '@nocobase/db';

export type MysqlConnectionConfig = BaseConnectionConfig & {
  dialect: 'mysql';
  charset?: string;
  timezone?: string;
  ssl?: boolean | Record<string, unknown>;
} & MysqlConnectionTargetConfig;

type MysqlConnectionTargetConfig =
  (HostConnectionConfig & { socketPath?: never }) | SocketConnectionConfig;

interface HostConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
}

interface SocketConnectionConfig {
  host?: never;
  port?: never;
  socketPath: string;
  database?: string;
  username?: string;
  password?: string;
}
