import path from 'node:path';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_UPLOAD_EXPIRES_IN_SECONDS = 15 * 60;
const DEFAULT_TEMPORARY_ACCESS_EXPIRES_IN_SECONDS = 5 * 60;
const DEFAULT_PROVIDER_URL_EXPIRES_IN_SECONDS = 60;
const PUBLIC_DIRECTORY_NAMES = new Set(['public', 'static', 'wwwroot']);

export interface FilesConfig {
  storage: FilesLocalStorageConfig | FilesS3StorageConfig;
  upload: { maxBytes: number; expiresInSeconds: number };
  access: {
    temporaryExpiresInSeconds: number;
    providerUrlExpiresInSeconds: number;
  };
  publicAccess: { enabled: boolean };
}

export interface FilesLocalStorageConfig {
  driver: 'local';
  root: string;
}

export interface FilesS3StorageConfig {
  driver: 's3';
  bucket: string;
  region?: string;
  endpoint?: string;
  prefix?: string;
  forcePathStyle?: boolean;
  credentials?: FilesS3Credentials;
}

export interface FilesS3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface ResolveFilesConfigOptions {
  appStorageRoot: string;
  config?: unknown;
  publicRoots?: readonly string[];
}

export function resolveFilesConfig(
  options: ResolveFilesConfigOptions,
): FilesConfig {
  const appStorageRoot = resolvePrivateDirectory(
    options.appStorageRoot,
    'appStorageRoot',
    options.publicRoots,
  );
  const config = readOptionalRecord(options.config, 'config');
  const storage = resolveStorage(
    config.storage,
    path.join(appStorageRoot, 'app/private/files'),
    options.publicRoots,
  );
  const upload = readOptionalRecord(config.upload, 'upload');
  const access = readOptionalRecord(config.access, 'access');
  const publicAccess = readOptionalRecord(config.publicAccess, 'publicAccess');

  return {
    storage,
    upload: {
      maxBytes: readPositiveInteger(
        upload.maxBytes,
        'upload.maxBytes',
        DEFAULT_MAX_BYTES,
      ),
      expiresInSeconds: readPositiveInteger(
        upload.expiresInSeconds,
        'upload.expiresInSeconds',
        DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
      ),
    },
    access: {
      temporaryExpiresInSeconds: readPositiveInteger(
        access.temporaryExpiresInSeconds,
        'access.temporaryExpiresInSeconds',
        DEFAULT_TEMPORARY_ACCESS_EXPIRES_IN_SECONDS,
      ),
      providerUrlExpiresInSeconds: readPositiveInteger(
        access.providerUrlExpiresInSeconds,
        'access.providerUrlExpiresInSeconds',
        DEFAULT_PROVIDER_URL_EXPIRES_IN_SECONDS,
      ),
    },
    publicAccess: {
      enabled: readBoolean(publicAccess.enabled, 'publicAccess.enabled', false),
    },
  };
}

function resolveStorage(
  value: unknown,
  defaultLocalRoot: string,
  publicRoots: readonly string[] | undefined,
): FilesConfig['storage'] {
  const storage = readOptionalRecord(value, 'storage');
  const driver = storage.driver ?? 'local';

  if (driver === 'local') {
    const root =
      storage.root === undefined
        ? defaultLocalRoot
        : readRequiredString(storage.root, 'storage.root');
    return {
      driver: 'local',
      root: resolvePrivateDirectory(root, 'storage.root', publicRoots),
    };
  }

  if (driver !== 's3') {
    throw configError('storage.driver must be "local" or "s3".');
  }

  const bucket = readRequiredString(storage.bucket, 'storage.bucket');
  const region = readOptionalString(storage.region, 'storage.region');
  const endpoint = readEndpoint(storage.endpoint);
  const prefix = readPrefix(storage.prefix);
  const forcePathStyle = readOptionalBoolean(
    storage.forcePathStyle,
    'storage.forcePathStyle',
  );
  const credentials = readCredentials(storage.credentials);

  return {
    driver: 's3',
    bucket,
    ...(region === undefined ? {} : { region }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(prefix === undefined ? {} : { prefix }),
    ...(forcePathStyle === undefined ? {} : { forcePathStyle }),
    ...(credentials === undefined ? {} : { credentials }),
  };
}

function readCredentials(value: unknown): FilesS3Credentials | undefined {
  if (value === undefined) {
    return undefined;
  }

  const credentials = readRecord(value, 'storage.credentials');
  const accessKeyId = readOptionalString(
    credentials.accessKeyId,
    'storage.credentials.accessKeyId',
  );
  const secretAccessKey = readOptionalString(
    credentials.secretAccessKey,
    'storage.credentials.secretAccessKey',
  );
  const sessionToken = readOptionalString(
    credentials.sessionToken,
    'storage.credentials.sessionToken',
  );

  if (!accessKeyId || !secretAccessKey) {
    throw configError(
      'storage.credentials must include both accessKeyId and secretAccessKey.',
    );
  }

  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken === undefined ? {} : { sessionToken }),
  };
}

function readEndpoint(value: unknown): string | undefined {
  const endpoint = readOptionalString(value, 'storage.endpoint');
  if (endpoint === undefined) {
    return undefined;
  }

  try {
    const parsed = new URL(endpoint);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error('invalid endpoint');
    }
  } catch {
    throw configError(
      'storage.endpoint must be an HTTP or HTTPS URL without credentials.',
    );
  }

  return endpoint;
}

function readPrefix(value: unknown): string | undefined {
  const prefix = readOptionalString(value, 'storage.prefix');
  if (prefix === undefined) {
    return undefined;
  }

  if (prefix.includes('\\')) {
    throw configError('storage.prefix must use forward slashes.');
  }

  const segments = prefix.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw configError('storage.prefix must not contain path traversal.');
  }

  return segments.join('/') || undefined;
}

function resolvePrivateDirectory(
  value: string,
  field: string,
  publicRoots: readonly string[] | undefined,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw configError(`${field} must not be empty.`);
  }

  if (hasTraversalSegment(trimmed)) {
    throw configError(`${field} must not contain path traversal.`);
  }

  if (!path.isAbsolute(trimmed)) {
    throw configError(`${field} must be an absolute path.`);
  }

  const resolved = path.resolve(trimmed);
  const segments = resolved
    .split(path.sep)
    .map((segment) => segment.toLowerCase());
  if (segments.some((segment) => PUBLIC_DIRECTORY_NAMES.has(segment))) {
    throw configError(`${field} must not point to a public static directory.`);
  }

  for (const publicRoot of publicRoots ?? []) {
    const resolvedPublicRoot = path.resolve(publicRoot);
    if (isSameOrInside(resolved, resolvedPublicRoot)) {
      throw configError(
        `${field} must not point to a public static directory.`,
      );
    }
  }

  return resolved;
}

function hasTraversalSegment(value: string): boolean {
  return value.split(/[\\/]+/).some((segment) => segment === '..');
}

function isSameOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function readPositiveInteger(
  value: unknown,
  field: string,
  defaultValue: number,
): number {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw configError(`${field} must be a positive safe integer.`);
  }

  return value;
}

function readBoolean(
  value: unknown,
  field: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'boolean') {
    throw configError(`${field} must be a boolean.`);
  }

  return value;
}

function readOptionalBoolean(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw configError(`${field} must be a boolean.`);
  }

  return value;
}

function readRequiredString(value: unknown, field: string): string {
  const result = readOptionalString(value, field);
  if (result === undefined) {
    throw configError(`${field} is required.`);
  }

  return result;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw configError(`${field} must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalRecord(
  value: unknown,
  field: string,
): Record<string, unknown> {
  return value === undefined ? {} : readRecord(value, field);
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw configError(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function configError(message: string): Error {
  return new Error(`Invalid Files configuration: ${message}`);
}
