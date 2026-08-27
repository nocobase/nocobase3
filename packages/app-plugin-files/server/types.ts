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

export interface CreateFileRouteOptions {
  readonly files: FilesService;
  readonly store: FileStore;
  readonly audience: string;
  readonly auth: MiddlewareHandler;
  readonly authorize?: FileRouteAuthorizer;
  readonly disk?: string;
  readonly visibility?: FileRouteVisibilityOptions;
  readonly limits?: FileRouteLimits;
}

export type FileContentSource =
  | Blob
  | Uint8Array
  | string
  | ReadableStream<Uint8Array>
  | AsyncIterable<Uint8Array>;

export interface PutFileInput {
  readonly filename: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly content: FileContentSource;
  readonly disk?: string;
}

export interface StoredFileObject {
  readonly disk: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface IssueFileAccessInput {
  readonly audience: string;
  readonly fileId: string;
  readonly contentPath: string;
  readonly expiresIn?: number;
}

export interface VerifyFileAccessInput {
  readonly audience: string;
  readonly fileId: string;
  readonly token: string;
  readonly now?: number;
}

export interface EnsureFileObjectInput {
  readonly disk?: string;
  readonly key: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly content: FileContentSource;
  readonly size?: number;
}

export interface FileAccessUrl {
  readonly url: string;
  readonly expiresAt: string | null;
}

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

export interface FilesService {
  createDatabaseStore(options: DatabaseFileStoreOptions): FileStore;
  put(input: PutFileInput): Promise<StoredFileObject>;
  open(record: FileRecord): Promise<ReadableStream<Uint8Array>>;
  removeObject(record: FileRecord): Promise<void>;
  issueAccessUrl(input: IssueFileAccessInput): Promise<FileAccessUrl>;
  verifyAccessToken(input: VerifyFileAccessInput): Promise<void>;
  ensureObject(input: EnsureFileObjectInput): Promise<void>;
}

export interface CreateFilesServiceOptions {
  readonly database?: DatabaseManager;
  readonly drive?: NocoBaseDriveManager;
  readonly publicBasePath: string;
  readonly defaultDisk: string;
  readonly tokenSecret?: string;
}
