import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Logging } from '@nocobase/logging';
import type { MiddlewareHandler } from 'hono';

import { FileUnavailableError } from './errors.js';

export interface FilePluginDeps {
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

export interface FilePluginRuntimeContext {
  readonly deps: FilePluginDeps;
  readonly config: FilePluginConfig;
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

export function resolveFilePluginRuntime({
  deps,
  config,
}: FilePluginRuntimeContext): FilePluginRuntimeResult {
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
