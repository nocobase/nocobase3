import type { Readable } from 'node:stream';

import type { SignedURLOptions, WriteOptions } from 'flydrive/types';

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

export interface FilesStorageDisk {
  put(
    key: string,
    contents: string | Uint8Array,
    options?: WriteOptions,
  ): Promise<void>;
  putStream(
    key: string,
    contents: Readable,
    options?: WriteOptions,
  ): Promise<void>;
  get(key: string): Promise<string>;
  getStream(key: string): Promise<Readable>;
  getMetaData(key: string): Promise<StorageObjectMetadata>;
  getSignedUrl(key: string, options?: SignedURLOptions): Promise<string>;
  getSignedUploadUrl(key: string, options?: SignedURLOptions): Promise<string>;
  copy(
    source: string,
    destination: string,
    options?: WriteOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
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
