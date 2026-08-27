import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Logging } from '@nocobase/logging';
import type { MiddlewareHandler } from 'hono';

import { FilesUnavailableError } from './errors.js';

export interface FilesPluginDeps {
  readonly database?: DatabaseManager;
  readonly driveManager?: NocoBaseDriveManager;
  readonly auth: {
    required(): MiddlewareHandler;
  };
  readonly authz: {
    middleware(): MiddlewareHandler<{
      Variables: {
        authz: {
          readonly identity: {
            readonly principal: { readonly type: string; readonly id: string };
            readonly subjects?: readonly {
              readonly type: string;
              readonly id: string;
            }[];
          };
        };
      };
    }>;
    readonly permissionSets: {
      getEffective(input: {
        readonly principal: { readonly type: string; readonly id: string };
        readonly subjects?: readonly {
          readonly type: string;
          readonly id: string;
        }[];
      }): Promise<readonly { readonly key: string }[]>;
    };
  };
  readonly logging: Pick<Logging, 'getLogger'>;
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

export interface UnavailableFilesPluginRuntime {
  readonly unavailable: true;
  readonly error: FilesUnavailableError;
}

export interface FilesPluginRuntime {
  readonly unavailable?: false;
  readonly database: DatabaseManager;
  readonly drive: NocoBaseDriveManager;
  readonly defaultDisk: string;
  readonly publicBasePath: string;
  readonly tokenSecret: string;
}

export type FilesPluginRuntimeResult =
  FilesPluginRuntime | UnavailableFilesPluginRuntime;

export function resolveFilesPluginRuntime({
  deps,
  config,
}: FilesPluginRuntimeContext): FilesPluginRuntimeResult {
  const database = deps.database;
  if (!database) return unavailable('File database storage is not configured.');
  const drive = deps.driveManager;
  if (!drive) return unavailable('File storage is not configured.');
  const tokenSecret = config.session?.secret;
  if (!tokenSecret) {
    return unavailable('File access token signing is not configured.');
  }
  return Object.freeze({
    database,
    drive,
    defaultDisk: config.drive?.default ?? 'local',
    publicBasePath: config.app.publicBasePath,
    tokenSecret,
  });
}

export function isFilesPluginRuntimeUnavailable(
  service: FilesPluginRuntimeResult,
): service is UnavailableFilesPluginRuntime {
  return Reflect.get(service, 'unavailable') === true;
}

function unavailable(message: string): UnavailableFilesPluginRuntime {
  return Object.freeze({
    unavailable: true,
    error: new FilesUnavailableError(message),
  });
}
