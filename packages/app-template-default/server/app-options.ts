import type { DatabaseManager } from '@nocobase/database';
import type { SpaHandler } from '@nocobase/app-server/spa';

export interface CreateAppOptions {
  appName?: string;
  internalBasePath?: string;
  publicBasePath?: string;
  publicApiUrl?: string;
  internalApiProxyPath?: string;
  database?: DatabaseManager;
  spa?: CreateAppSpaOptions;
  nocoBaseApiUrl?: string | false;
}

export interface CreateAppSpaOptions {
  handler?: SpaHandler;
  indexPath?: string;
  runtime?: CreateAppSpaRuntimeOptions;
}

export interface CreateAppSpaRuntimeOptions {
  storagePrefix?: string;
  storageType?: string;
  shareToken?: boolean;
}

export type { SpaHandler };
