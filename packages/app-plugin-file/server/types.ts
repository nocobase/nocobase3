import type { DatabaseManager } from '@nocobase/app-database';
import type { NocoBaseDriveManager } from '@nocobase/drive';
import type { Context, MiddlewareHandler } from 'hono';

export interface FileRecord {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
  readonly createdAt: Date | string;
  readonly updatedAt: Date | string;
}

export interface NewFileRecord {
  readonly id: string;
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
  readonly public: boolean;
}

export interface FileStore {
  list(context: Context): Promise<readonly FileRecord[]>;
  find(id: string, context: Context): Promise<FileRecord | null>;
  create(input: NewFileRecord, context: Context): Promise<FileRecord>;
  remove(id: string, context: Context): Promise<FileRecord | null>;
}

export type FileRouteAction =
  'list' | 'upload' | 'read' | 'issue-token' | 'delete';

export type FileRouteAuthorizer = (
  context: Context,
  action: FileRouteAction,
  file?: FileRecord,
) => void | Response | Promise<void | Response>;

export type FileVisibility = 'private' | 'public';

export interface FileRouteVisibilityOptions {
  readonly default: FileVisibility;
  readonly allowClientOverride: boolean;
}

export const DEFAULT_FILE_ROUTE_VISIBILITY: Readonly<FileRouteVisibilityOptions> =
  Object.freeze({
    default: 'private',
    allowClientOverride: false,
  });

export interface FileRouteLimits {
  readonly maxSize?: number;
  readonly maxFiles?: number;
  readonly mimeTypes?: readonly string[];
}

interface CreateFileRouteCommonOptions {
  readonly drive?: NocoBaseDriveManager;
  readonly defaultDisk: string;
  readonly publicBasePath: string;
  readonly tokenSecret?: string;
  readonly audience: string;
  readonly auth: MiddlewareHandler;
  readonly authorize?: FileRouteAuthorizer;
  readonly disk?: string;
  readonly visibility?: FileRouteVisibilityOptions;
  readonly limits?: FileRouteLimits;
}

export interface DatabaseFileRouteSource {
  readonly database: DatabaseManager;
  readonly table: string;
  readonly scope?: DatabaseFileScopeResolver;
  readonly order?: DatabaseFileOrder;
  readonly store?: never;
}

export interface CustomFileRouteSource {
  readonly store: FileStore;
  readonly database?: never;
  readonly table?: never;
  readonly scope?: never;
  readonly order?: never;
}

export type CreateFileRouteOptions = CreateFileRouteCommonOptions &
  (DatabaseFileRouteSource | CustomFileRouteSource);

export type DatabaseFileScopeValue = string | number | boolean | null;

export type DatabaseFileScope = Readonly<
  Record<string, DatabaseFileScopeValue>
>;

export type DatabaseFileScopeResolver = (context: Context) => DatabaseFileScope;

export type DatabaseFileOrderField =
  'createdAt' | 'updatedAt' | 'filename' | 'size';

export interface DatabaseFileOrder {
  readonly field: DatabaseFileOrderField;
  readonly direction?: 'asc' | 'desc';
}

export interface DatabaseFileStoreOptions {
  readonly table: string;
  readonly scope?: DatabaseFileScopeResolver;
  readonly order?: DatabaseFileOrder;
}
