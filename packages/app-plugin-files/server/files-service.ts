import type {
  CreateFilesServiceOptions,
  DatabaseFileStoreOptions,
  EnsureFileObjectInput,
  FileAccessUrl,
  FileRecord,
  FilesService,
  FileStore,
  IssueFileAccessInput,
  PutFileInput,
  StoredFileObject,
  VerifyFileAccessInput,
} from './types.js';

export function createFilesService(
  _options: CreateFilesServiceOptions,
): FilesService {
  const notImplemented = (feature: string): Error =>
    new Error(`${feature} is not implemented yet.`);

  return {
    createDatabaseStore(_storeOptions: DatabaseFileStoreOptions): FileStore {
      throw notImplemented('Database file store');
    },
    put(_input: PutFileInput): Promise<StoredFileObject> {
      return Promise.reject(notImplemented('File upload'));
    },
    open(_record: FileRecord): Promise<ReadableStream<Uint8Array>> {
      return Promise.reject(notImplemented('File content read'));
    },
    removeObject(_record: FileRecord): Promise<void> {
      return Promise.reject(notImplemented('File removal'));
    },
    issueAccessUrl(_input: IssueFileAccessInput): Promise<FileAccessUrl> {
      return Promise.reject(notImplemented('File access URL creation'));
    },
    verifyAccessToken(_input: VerifyFileAccessInput): Promise<void> {
      return Promise.reject(notImplemented('File access token verification'));
    },
    ensureObject(_input: EnsureFileObjectInput): Promise<void> {
      return Promise.reject(notImplemented('File fixture storage'));
    },
  };
}
