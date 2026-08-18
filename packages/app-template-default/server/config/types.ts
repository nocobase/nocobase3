import type { AppDatabaseConfig } from '@nocobase/app-server/database';

export interface AppRoutingConfig {
  name: string;
  publicBasePath: string;
  internalBasePath: string;
  internalApiProxyPath: string;
  publicApiUrl: string;
  nocoBaseApiUrl: string | undefined;
}

export interface AppServerConfig {
  host: string;
  port: number;
  startLog: boolean;
  viteDevUrl: URL | undefined;
}

export interface AppSpaConfig {
  indexPath: string;
  runtime: {
    storagePrefix: string;
    storageType: string;
    shareToken: boolean;
  };
}

export interface AppConfig {
  app: AppRoutingConfig;
  database: AppDatabaseConfig;
  server: AppServerConfig;
  spa: AppSpaConfig;
}
