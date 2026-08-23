import type { FilesConfig } from '../../config.js';
import { NodeLocalFilesStorage } from './local.js';
import { ProviderS3FilesStorage } from './s3.js';
import type { InternalFilesStorage, S3Provider } from './types.js';

export { createAwsS3ClientConfig } from './aws-s3-provider.js';
export { NodeLocalFilesStorage } from './local.js';
export { ProviderS3FilesStorage } from './s3.js';
export type {
  InternalFilesStorage,
  LocalCandidateWriteOptions,
  LocalFilesStorage,
  S3FilesStorage,
  S3Provider,
  SignedReadOptions,
  SignedStorageRequest,
  SignedUploadOptions,
  StorageObjectMetadata,
} from './types.js';

export interface CreateInternalFilesStorageOptions {
  s3Provider?: S3Provider;
}

export function createInternalFilesStorage(
  config: FilesConfig,
  options: CreateInternalFilesStorageOptions = {},
): InternalFilesStorage {
  if (config.storage.driver === 'local') {
    return new NodeLocalFilesStorage(config.storage);
  }

  return new ProviderS3FilesStorage(config.storage, options.s3Provider);
}
