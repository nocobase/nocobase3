import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type {
  DatabaseManager,
  Repository,
  RepositoryQuery,
} from '@nocobase/db';
import type { driveManagerToken } from '@nocobase/app-server/drive';
import type { ServiceToken } from '@nocobase/service-provider';
import type {
  FileRecord,
  UploadOneInput,
  UploadManyInput,
  UploadOneResult,
  UploadManyResult,
} from '../shared/types.js';

// Resolve the Drive type through the application peer that owns the service.
type AppDriveManager =
  typeof driveManagerToken extends ServiceToken<infer T> ? T : never;

export interface FileRepositoryOptions {
  readonly connection?: string;
  readonly disk: string;
  readonly accessPath: string;
}
export interface FileOperations {
  validateCollection(): Promise<void>;
  uploadOne(input: UploadOneInput): Promise<UploadOneResult>;
  uploadMany(input: UploadManyInput): Promise<UploadManyResult>;
  getUrl(record: Pick<FileRecord, 'id' | 'ext'>): string;
  getStorageUrl(record: Pick<FileRecord, 'disk' | 'key'>): Promise<string>;
}
export type ServerFileRepository = Repository<FileRecord> & FileOperations;

export class FileRepositoryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'FileRepositoryError';
  }
}

export function normalizeAccessPath(value: string): string {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(value))
    throw new Error(
      'accessPath must be an absolute application path with literal segments and no trailing slash.',
    );
  return value;
}

export class ServerFileRepositoryManager {
  constructor(
    private readonly database: DatabaseManager,
    private readonly drive: AppDriveManager,
  ) {}

  repository(
    collection: string,
    options: FileRepositoryOptions,
  ): ServerFileRepository {
    if (!collection || !options.disk)
      throw new Error('collection and disk are required.');
    const accessPath = normalizeAccessPath(options.accessPath);
    const repository = this.database.repository<FileRecord>(
      collection,
      options.connection,
    );
    const validateCollection = async (): Promise<void> => {
      const definition = await this.database
        .connection(options.connection)
        .collections.get(collection);
      const fail = (field: string, reason: string): never => {
        throw new FileRepositoryError(
          'INVALID_FILE_COLLECTION',
          `Collection "${collection}", field "${field}": ${reason}.`,
        );
      };
      if (!definition) fail('*', 'collection does not exist');
      const fields = definition?.fields ?? [];
      for (const [name, types] of Object.entries({
        id: ['uuid', 'string', 'char', 'text'],
        disk: ['string', 'char', 'text'],
        key: ['string', 'char', 'text'],
        filename: ['string', 'char', 'text'],
        ext: ['string', 'char', 'text'],
        mimeType: ['string', 'char', 'text'],
        size: ['integer', 'bigInt'],
        createdAt: ['datetime', 'datetimeTz'],
        updatedAt: ['datetime', 'datetimeTz'],
      })) {
        const field = fields.find((item) => item.name === name);
        if (!field || !types.includes(field.type))
          fail(name, `requires ${types.join(' or ')}`);
        if (name === 'id' && field?.autoIncrement)
          fail(name, 'must accept a server-generated UUID');
        if (name === 'id' && field?.length !== undefined && field.length < 36)
          fail(name, 'must hold a UUID');
      }
      const primary =
        definition?.constraints
          ?.filter((item) => item.type === 'primary')
          .flatMap((item) => item.fields) ?? [];
      const keys = new Set([
        ...primary,
        ...fields.filter((item) => item.primaryKey).map((item) => item.name),
      ]);
      if (keys.size !== 1 || !keys.has('id'))
        fail('id', 'must be the sole primary key');
    };
    const getUrl = (record: Pick<FileRecord, 'id' | 'ext'>): string =>
      `${accessPath}/${encodeURIComponent(record.id)}${record.ext ? `.${encodeURIComponent(record.ext)}` : ''}`;
    const store = async (file: File, owned: string[]): Promise<FileRecord> => {
      const disk = this.drive.use(options.disk);
      const id = randomUUID();
      // Strip client paths, controls and malformed Unicode before generating any headers.

      const filename =
        (Buffer.from(file.name).toString('utf8').split(/[\\/]/).pop() ?? '')
          .normalize('NFC')
          // eslint-disable-next-line no-control-regex -- Strip controls from an untrusted filename.
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim() || 'file';
      const suffix =
        filename.lastIndexOf('.') > 0
          ? filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
          : '';
      const ext = /^[a-z0-9]{1,32}$/.test(suffix) ? suffix : '';
      const key = `objects/${id}${ext ? `.${ext}` : ''}`;
      const mimeType = validMime(file.type);
      owned.push(key); // A failed put may have left a partial object.
      await disk.putStream(
        key,
        Readable.fromWeb(file.stream() as NodeReadableStream<Uint8Array>),
        { contentType: mimeType, contentLength: file.size },
      );
      const metadata = await disk.getMetaData(key);
      if (
        !Number.isSafeInteger(metadata.contentLength) ||
        metadata.contentLength < 0 ||
        metadata.contentLength !== file.size
      )
        throw new FileRepositoryError(
          'INVALID_FILE_METADATA',
          'Stored file size does not match the uploaded file.',
        );
      const now = new Date().toISOString();
      const definition = await this.database
        .connection(options.connection)
        .collections.get(collection);
      const timestamp = (name: string): string =>
        definition?.fields?.find((field) => field.name === name)?.type ===
        'datetime'
          ? now.slice(0, -1)
          : now;
      return {
        id,
        disk: options.disk,
        key,
        filename,
        ext,
        mimeType: validMime(metadata.contentType ?? mimeType),
        size: metadata.contentLength,
        createdAt: timestamp('createdAt'),
        updatedAt: timestamp('updatedAt'),
      };
    };
    const compensate = async (
      keys: string[],
      cause: unknown,
      databaseAttempted: boolean,
    ): Promise<never> => {
      if (databaseAttempted) {
        // A lost commit acknowledgement must never delete an object a record now owns.
        try {
          const committed = await Promise.all(
            keys.map((key) =>
              repository.exists({ filter: { key, disk: options.disk } }),
            ),
          );
          keys = keys.filter((_key, index) => !committed[index]);
        } catch (verificationError) {
          throw new FileRepositoryError(
            'FILE_COMMIT_UNCERTAIN',
            'Could not verify database commit; uploaded objects were retained for reconciliation.',
            { cause: new AggregateError([cause, verificationError]) },
          );
        }
      }
      const results = await Promise.allSettled(
        keys.map((key) => this.drive.use(options.disk).delete(key)),
      );
      const failures = results.filter((result) => result.status === 'rejected');
      if (failures.length)
        throw new FileRepositoryError(
          'FILE_CLEANUP_FAILED',
          'Upload failed and some objects could not be removed.',
          {
            cause: new AggregateError([
              cause,
              ...failures.map((result) => result.reason as unknown),
            ]),
          },
        );
      throw cause;
    };
    const operations: FileOperations = {
      validateCollection,
      getUrl,
      getStorageUrl: async (record) => {
        const disk = this.drive.use(record.disk);
        try {
          const url =
            (await disk.getVisibility(record.key)) === 'public'
              ? await disk.getUrl(record.key)
              : await disk.getSignedUrl(record.key, { expiresIn: '5 mins' });
          if (
            !url ||
            (!url.startsWith('/') && !/^https?:\/\//i.test(url)) ||
            url.startsWith('//')
          )
            throw new Error('Unsupported storage URL.');
          return url;
        } catch (cause) {
          throw new FileRepositoryError(
            'STORAGE_URL_UNAVAILABLE',
            'The file disk cannot generate a storage URL.',
            { cause },
          );
        }
      },
      uploadOne: async ({ file }) => {
        await validateCollection();
        if (!(file instanceof File))
          throw new FileRepositoryError(
            'INVALID_FILE',
            'Exactly one File is required.',
          );
        const owned: string[] = [];
        let result: UploadOneResult;
        let databaseAttempted = false;
        try {
          const values = await store(file, owned);
          databaseAttempted = true;
          result = await repository.createOne({ values });
        } catch (cause) {
          return compensate(owned, cause, databaseAttempted);
        }
        return {
          ...result,
          record: {
            ...normalizeFileRecord(result.record),
            contentUrl: getUrl(result.record),
          },
        };
      },
      uploadMany: async ({ files }) => {
        await validateCollection();
        if (
          !Array.isArray(files) ||
          !files.length ||
          !files.every((file) => file instanceof File)
        )
          throw new FileRepositoryError(
            'INVALID_FILES',
            'At least one File is required.',
          );
        const owned: string[] = [];
        let result: UploadManyResult;
        let databaseAttempted = false;
        try {
          const values: FileRecord[] = [];
          for (const file of files) values.push(await store(file, owned));
          databaseAttempted = true;
          result = await repository.createMany({
            values: values as [FileRecord, ...FileRecord[]],
            select: (s) =>
              s.fields(
                'id',
                'disk',
                'key',
                'filename',
                'ext',
                'mimeType',
                'size',
                'createdAt',
                'updatedAt',
              ),
          });
        } catch (cause) {
          return compensate(owned, cause, databaseAttempted);
        }
        return {
          ...result,
          records: result.records.map((record) => ({
            ...normalizeFileRecord(record),
            contentUrl: getUrl(record),
          })),
        };
      },
    };
    // Preserve Repository overloads, lazy queries and async iteration at the composition boundary.
    return new Proxy(repository, {
      get(target, property, receiver): unknown {
        if (Object.hasOwn(operations, property))
          return Reflect.get(operations, property);
        const method: unknown = Reflect.get(target, property, receiver);
        if (typeof method !== 'function') return method;
        if (property === 'findMany')
          return (...args: unknown[]) =>
            guardedQuery(
              () =>
                Reflect.apply(
                  method,
                  target,
                  args,
                ) as RepositoryQuery<FileRecord>,
              validateCollection,
            );
        return async (...args: unknown[]): Promise<unknown> => {
          await validateCollection();
          const result: unknown = await Reflect.apply(method, target, args);
          switch (property) {
            case 'findOne':
            case 'createOne':
            case 'createMany':
            case 'updateOne':
            case 'updateMany':
            case 'upsertOne':
            case 'deleteOne':
            case 'deleteMany':
              return normalizeFileResult(result);
            default:
              return result;
          }
        };
      },
    }) as ServerFileRepository;
  }
}

export function normalizeFileRecord<T extends object>(record: T): T {
  if (!('size' in record)) return record;
  const value: unknown = record.size;
  const size =
    typeof value === 'number'
      ? value
      : typeof value === 'bigint' ||
          (typeof value === 'string' && /^\d+$/.test(value))
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(size) || size < 0)
    throw new FileRepositoryError(
      'INVALID_FILE_METADATA',
      'File size must be a non-negative safe integer.',
    );
  return { ...record, size };
}

function normalizeFileResult(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeFileResult);
  if (!value || typeof value !== 'object') return value;
  if ('record' in value)
    return { ...value, record: normalizeFileResult(value.record) };
  if ('records' in value)
    return { ...value, records: normalizeFileResult(value.records) };
  return normalizeFileRecord(value);
}

export function validMime(value: string): string {
  return /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(value)
    ? value.toLowerCase()
    : 'application/octet-stream';
}

function guardedQuery<T extends object>(
  create: () => RepositoryQuery<T>,
  validate: () => Promise<void>,
): RepositoryQuery<T> {
  let query: RepositoryQuery<T> | undefined;
  const get = (): RepositoryQuery<T> => (query ??= create());
  const run = async (): Promise<T[]> => {
    await validate();
    return (await get()).map(normalizeFileRecord);
  };
  return {
    then: (yes, no) => run().then(yes, no),
    catch: (no) => run().catch(no),
    finally: (callback) => run().finally(callback),
    async *[Symbol.asyncIterator]() {
      await validate();
      for await (const record of get()) yield normalizeFileRecord(record);
    },
  };
}
