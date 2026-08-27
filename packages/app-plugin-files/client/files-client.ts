import type {
  CreateFilesClientOptions,
  FileAccessUrl,
  FileRecord,
  FilesClient,
  FileUploadOptions,
} from './types.js';

export function createFilesClient(
  _options: CreateFilesClientOptions,
): FilesClient {
  const notImplemented = (): Error =>
    new Error('Files client behavior is not implemented yet.');

  return {
    list(): Promise<readonly FileRecord[]> {
      return Promise.reject(notImplemented());
    },
    upload(
      _file: File,
      _uploadOptions?: FileUploadOptions,
    ): Promise<FileRecord> {
      return Promise.reject(notImplemented());
    },
    get(_id: string): Promise<FileRecord> {
      return Promise.reject(notImplemented());
    },
    createAccessUrl(_id: string, _expiresIn?: number): Promise<FileAccessUrl> {
      return Promise.reject(notImplemented());
    },
    remove(_id: string): Promise<void> {
      return Promise.reject(notImplemented());
    },
  };
}
