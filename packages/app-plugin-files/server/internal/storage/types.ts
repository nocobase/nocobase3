import type { Readable } from 'node:stream';

export interface StorageObjectMetadata {
  contentLength: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

export interface LocalCandidateWriteOptions {
  contentType?: string;
  contentLength?: number;
}

export interface SignedUploadOptions {
  expiresInSeconds: number;
  contentLength: number;
  contentType?: string;
}

export interface SignedReadOptions {
  expiresInSeconds: number;
  contentDisposition?: string;
  cacheControl?: string;
}

export interface SignedStorageRequest {
  method: 'PUT';
  url: string;
  headers: Record<string, string>;
}

interface CommonFilesStorage {
  putCandidate(
    key: string,
    contents: Readable,
    options?: LocalCandidateWriteOptions,
  ): Promise<void>;
  head(key: string): Promise<StorageObjectMetadata>;
  finalizeCandidate(candidateKey: string, readyKey: string): Promise<void>;
  openRead(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  dispose(): Promise<void>;
}

export interface LocalFilesStorage extends CommonFilesStorage {
  readonly driver: 'local';
}

export interface S3FilesStorage extends CommonFilesStorage {
  readonly driver: 's3';
  createCandidateUpload(
    key: string,
    options: SignedUploadOptions,
  ): Promise<SignedStorageRequest>;
  createReadUrl(key: string, options: SignedReadOptions): Promise<string>;
}

export type InternalFilesStorage = LocalFilesStorage | S3FilesStorage;

export interface S3Provider {
  createUploadUrl(key: string, options: SignedUploadOptions): Promise<string>;
  putObject?(
    key: string,
    contents: Readable,
    options: LocalCandidateWriteOptions,
  ): Promise<void>;
  headObject(key: string): Promise<StorageObjectMetadata>;
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;
  openRead?(key: string): Promise<Readable>;
  createReadUrl(key: string, options: SignedReadOptions): Promise<string>;
  deleteObject(key: string): Promise<void>;
  dispose(): void;
}
