import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { MiddlewareHandler } from 'hono';

import { FilesUnavailableError } from './errors.js';
import { createFilesService } from './files-service.js';
import type { FilesService } from './types.js';

export type AppAuthorization = object;

export interface FilesPluginDeps {
  readonly database?: DatabaseManager;
  readonly driveManager?: NocoBaseDriveManager;
  readonly auth: {
    required(): MiddlewareHandler;
  };
  readonly authz: AppAuthorization;
}

export interface FilesPluginConfig {
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

export interface FilesPluginRuntimeContext {
  readonly deps: FilesPluginDeps;
  readonly config: FilesPluginConfig;
}

export interface UnavailableFilesPluginService {
  readonly unavailable: true;
  readonly files: FilesService;
  readonly error: FilesUnavailableError;
}

export type FilesPluginService = FilesService | UnavailableFilesPluginService;

export function createPluginFilesService({
  deps,
  config,
}: FilesPluginRuntimeContext): FilesPluginService {
  const files = createFilesService({
    database: deps.database,
    drive: deps.driveManager,
    publicBasePath: config.app.publicBasePath,
    defaultDisk: config.drive?.default ?? 'local',
    tokenSecret: config.session?.secret,
  });
  const unavailableMessage = resolveUnavailableMessage(deps, config);
  if (!unavailableMessage) {
    return files;
  }
  return Object.freeze({
    unavailable: true,
    files,
    error: new FilesUnavailableError(unavailableMessage),
  });
}

export function isFilesPluginServiceUnavailable(
  service: FilesPluginService,
): service is UnavailableFilesPluginService {
  return Reflect.get(service, 'unavailable') === true;
}

function resolveUnavailableMessage(
  deps: FilesPluginDeps,
  config: FilesPluginConfig,
): string | undefined {
  if (!deps.database) {
    return 'File database storage is not configured.';
  }
  if (!deps.driveManager) {
    return 'File storage is not configured.';
  }
  if (!config.session?.secret) {
    return 'File access token signing is not configured.';
  }
  return undefined;
}
