import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import { driveManagerToken, type NocoBaseDriveManager } from '@nocobase/drive';
import type { ServiceResolver } from '@nocobase/service-provider';

import { FileUnavailableError } from './errors.js';

export interface FilePluginConfig {
  readonly app: {
    readonly publicBasePath: string;
  };
  readonly drive?: {
    readonly default: string;
    readonly disks?: Readonly<Record<string, unknown>>;
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
  readonly diskNames: readonly string[];
  readonly publicBasePath: string;
  readonly tokenSecret: string;
}

export type FilePluginRuntimeResult =
  FilePluginRuntime | UnavailableFilePluginRuntime;

export function resolveFilePluginRuntime(
  container: ServiceResolver,
  config: FilePluginConfig,
): FilePluginRuntimeResult {
  if (!container.has(databaseManagerToken)) {
    return unavailable('File database storage is not configured.');
  }
  if (!container.has(driveManagerToken)) {
    return unavailable('File storage is not configured.');
  }
  const database = container.resolve(databaseManagerToken);
  const drive = container.resolve(driveManagerToken);
  const tokenSecret = config.session?.secret;
  if (!tokenSecret) {
    return unavailable('File access token signing is not configured.');
  }
  return Object.freeze({
    database,
    drive,
    defaultDisk: config.drive?.default ?? 'local',
    diskNames: Object.keys(config.drive?.disks ?? {}),
    publicBasePath: config.app.publicBasePath,
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
