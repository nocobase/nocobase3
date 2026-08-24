import type { StoredFile } from '../../client/types.js';

export type FileStatus = 'pending' | 'ready' | 'failed';
export type PublicDisposition = 'inline' | 'attachment';

export interface FileRecord {
  id: string;
  status: FileStatus;
  storageKey: string | null;
  name: string;
  size: number | null;
  contentType: string | null;
  uploadExpiresAt: Date;
  publicTokenHash: string | null;
  publicDisposition: PublicDisposition | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toStoredFile(record: FileRecord): StoredFile {
  return {
    id: record.id,
    status: record.status,
    name: record.name,
    size: record.size,
    contentType: record.contentType,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function readFileRecord(row: Record<string, unknown>): FileRecord {
  const status = readFileStatus(row.status);
  const storageKey = readNullableString(row.storageKey, 'storageKey');
  const size = readNullableSize(row.size);
  const publicTokenHash = readNullableString(
    row.publicTokenHash,
    'publicTokenHash',
  );
  const publicDisposition = readPublicDisposition(row.publicDisposition);

  if (status === 'ready' && storageKey === null) {
    throw invalidRecord('ready files must have a storageKey');
  }
  if (status !== 'ready' && storageKey !== null) {
    throw invalidRecord('only ready files may have a storageKey');
  }
  if ((publicTokenHash === null) !== (publicDisposition === null)) {
    throw invalidRecord(
      'publicTokenHash and publicDisposition must be set or cleared together',
    );
  }

  return {
    id: readString(row.id, 'id'),
    status,
    storageKey,
    name: readString(row.name, 'name'),
    size,
    contentType: readNullableString(row.contentType, 'contentType'),
    uploadExpiresAt: readDate(row.uploadExpiresAt, 'uploadExpiresAt'),
    publicTokenHash,
    publicDisposition,
    createdAt: readDate(row.createdAt, 'createdAt'),
    updatedAt: readDate(row.updatedAt, 'updatedAt'),
  };
}

function readFileStatus(value: unknown): FileStatus {
  if (value === 'pending' || value === 'ready' || value === 'failed') {
    return value;
  }
  throw invalidRecord('status is invalid');
}

function readPublicDisposition(value: unknown): PublicDisposition | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value === 'inline' || value === 'attachment') {
    return value;
  }
  throw invalidRecord('publicDisposition is invalid');
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw invalidRecord(`${field} is invalid`);
  }
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return readString(value, field);
}

function readNullableSize(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const size = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw invalidRecord('size is invalid');
  }
  return size;
}

function readDate(value: unknown, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(normalizeDateInput(value));
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  throw invalidRecord(`${field} is invalid`);
}

function normalizeDateInput(value: string | number): string | number {
  if (typeof value === 'number' || /(?:Z|[+-]\d\d:?\d\d)$/i.test(value)) {
    return value;
  }
  return `${value.replace(' ', 'T')}Z`;
}

function invalidRecord(message: string): Error {
  return new Error(`Invalid files record: ${message}.`);
}
