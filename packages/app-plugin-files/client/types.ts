export type { FileUploadPlan, StoredFile } from '../protocol.js';
import type {
  FileDisposition,
  PublicFileAccess,
  StoredFile,
  TemporaryFileAccess,
} from '../protocol.js';

export interface FileUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface ExecuteFileUploadPlanOptions {
  signal?: AbortSignal;
  onProgress?(progress: FileUploadProgress): void;
}

export type FileClientOperation =
  | 'list'
  | 'create'
  | 'upload'
  | 'complete'
  | 'commit'
  | 'cancel'
  | 'access'
  | 'detach'
  | 'public-access';

export interface FileClientErrorOptions {
  code: string;
  status: number;
  operation: FileClientOperation;
  cause?: unknown;
}

export interface CreateFileAdapterOptions {
  client: FileAppClient;
  basePath: string;
}

export interface FileAppClient {
  request<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}

export interface FileAdapterItem extends StoredFile {
  slot?: number;
}

export type FileAdapterUploadOptions = ExecuteFileUploadPlanOptions;

export interface FilePublicAccessResult {
  item: FileAdapterItem;
  access: PublicFileAccess;
}

export interface FileUploadAdapter {
  list(): Promise<FileAdapterItem[]>;
  upload(
    file: File,
    options?: FileAdapterUploadOptions,
  ): Promise<FileAdapterItem>;
  retry(
    file: File,
    options?: FileAdapterUploadOptions,
  ): Promise<FileAdapterItem>;
  replace(
    fileId: string,
    file: File,
    options?: FileAdapterUploadOptions,
  ): Promise<FileAdapterItem>;
  access(
    fileId: string,
    disposition?: FileDisposition,
  ): Promise<TemporaryFileAccess>;
  detach(fileId: string): Promise<void>;
  enablePublicAccess(
    fileId: string,
    disposition?: FileDisposition,
  ): Promise<FilePublicAccessResult>;
  resetPublicAccess(
    fileId: string,
    disposition?: FileDisposition,
  ): Promise<FilePublicAccessResult>;
  disablePublicAccess(fileId: string): Promise<FileAdapterItem>;
}
