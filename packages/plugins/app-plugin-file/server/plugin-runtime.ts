import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { sessionManagerToken } from '@nocobase/app-server/session';
import { appConfig, type AppConfigAccessor } from '@nocobase/app-server/config';
import type { ServiceResolver } from '@nocobase/service-provider';

import { FileUnavailableError } from './errors.js';

export interface FilePluginConfig {
  readonly app: {
    readonly publicBasePath: string;
  };
  readonly drive?: {
    readonly default: string;
  };
  readonly session?: {
    readonly secret?: string;
  };
}

export interface UnavailableFilePluginRuntime {
  readonly unavailable: true;
  readonly error: FileUnavailableError;
}

export interface FilePluginRuntime {
  readonly unavailable?: false;
  readonly database: DatabaseManager;
  readonly drive: NocoBaseDriveManager;
  readonly defaultDisk: string;
  readonly publicBasePath: string;
  readonly tokenSecret: string;
}

export type FilePluginRuntimeResult =
  FilePluginRuntime | UnavailableFilePluginRuntime;

export function resolveFilePluginRuntime(
  container: ServiceResolver,
  config: AppConfigAccessor,
): FilePluginRuntimeResult {
  if (!container.has(databaseManagerToken)) {
    return unavailable('File database storage is not configured.');
  }
  if (!container.has(driveManagerToken)) {
    return unavailable('File storage is not configured.');
  }
  const database = container.resolve(databaseManagerToken);
  const drive = container.resolve(driveManagerToken);
  const session = container.resolve(sessionManagerToken).config;
  const driveConfigValue = config.get(driveConfig);
  const app = config.get(appConfig);
  const tokenSecret = session?.secret;
  if (!tokenSecret) {
    return unavailable('File access token signing is not configured.');
  }
  return Object.freeze({
    database,
    drive,
    defaultDisk: driveConfigValue.default,
    publicBasePath: app.publicBasePath,
    tokenSecret,
  });
}

export function isFilePluginRuntimeUnavailable(
  service: FilePluginRuntimeResult,
): service is UnavailableFilePluginRuntime {
  return Reflect.get(service, 'unavailable') === true;
}

function unavailable(message: string): UnavailableFilePluginRuntime {
  return Object.freeze({
    unavailable: true,
    error: new FileUnavailableError(message),
  });
}
