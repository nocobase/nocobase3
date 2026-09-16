import type { BaseConnectionConfig } from '@nocobase/db';

export type OceanbaseConnectionConfig = BaseConnectionConfig & {
  dialect: 'oceanbase';
  charset?: string;
  timezone?: string;
  ssl?: boolean | Record<string, unknown>;
} & OceanbaseConnectionTargetConfig;

type OceanbaseConnectionTargetConfig =
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
