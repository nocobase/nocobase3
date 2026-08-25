import type { Context, Hono } from 'hono';

import type {
  FileDisposition,
  FileUploadPlan,
  StoredFile,
} from '../protocol.js';

export interface FileService {
  createFileRoute(options: CreateFileRouteOptions): Hono;
  createUpload(input: CreateUploadInput): Promise<FileUploadPlan>;
  createFile(input: CreateFileInput): Promise<StoredFile>;
  getFile(fileId: string): Promise<StoredFile | null>;
  getFiles(fileIds: readonly string[]): Promise<Array<StoredFile | null>>;
  openFile(fileId: string): Promise<OpenedFile>;
  createTemporaryAccessUrl(
    fileId: string,
    options?: FileAccessOptions,
  ): Promise<string>;
  cancelUpload(fileId: string): Promise<void>;
  enablePublicAccess(
    fileId: string,
    options?: PublicAccessOptions,
  ): Promise<string>;
  resetPublicAccess(
    fileId: string,
    options?: PublicAccessOptions,
  ): Promise<string>;
  disablePublicAccess(fileId: string): Promise<void>;
}

export interface CreateUploadInput {
  name: string;
  size: number;
  contentType?: string;
  constraints?: FileConstraints;
}

export type FileContentSource =
  ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

export interface CreateFileInput {
  name: string;
  contentType?: string;
  size?: number;
  content: FileContentSource;
  constraints?: FileConstraints;
}

export interface OpenedFile {
  file: StoredFile;
  stream: ReadableStream<Uint8Array>;
}

export interface FileAccessOptions {
  disposition?: FileDisposition;
  expiresInSeconds?: number;
}

export interface PublicAccessOptions {
  disposition?: FileDisposition;
}

export interface CreateFileRouteOptions {
  binding: FileFieldBinding | FileRelationBinding;
  constraints?: FileConstraints;
  authorize(input: FileRouteAuthorizationInput): void | Promise<void>;
  publicAccess?: boolean;
}

export interface FileRouteAuthorizationInput {
  context: Context;
  action: 'read' | 'write' | 'share';
  recordId: string;
  fileId?: string;
}

export interface FileFieldBinding {
  type: 'field';
  collection: string;
  recordParam: string;
  fileField: string;
  recordKey?: string;
}

export interface FileRelationBinding {
  type: 'relation';
  collection: string;
  parentCollection: string;
  parentField?: string;
  recordParam: string;
  recordField: string;
  maxFiles: number;
}

export interface FileConstraints {
  maxBytes?: number;
  allowedExtensions?: readonly string[];
  allowedContentTypes?: readonly string[];
}
