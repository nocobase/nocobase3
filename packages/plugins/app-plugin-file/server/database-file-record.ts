import type { Row } from '@nocobase/db';

import type { FileRecord } from './types.js';

export interface DatabaseFileRow extends Row {
  id: string;
  disk: string;
  key: string;
  filename: string;
  mimeType: string;
  size: unknown;
  public: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export const DATABASE_FILE_COLUMNS: readonly string[] = Object.freeze([
  'id',
  'disk',
  'key',
  'filename',
  'mimeType',
  'size',
  'public',
  'createdAt',
  'updatedAt',
]);

export function toDatabaseFileRecord(row: DatabaseFileRow): FileRecord {
  return {
    id: row.id,
    disk: row.disk,
    key: row.key,
    filename: row.filename,
    mimeType: row.mimeType,
    size: normalizeDatabaseFileSize(row.size),
    public: normalizeDatabaseFileVisibility(row.public),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function normalizeDatabaseFileSize(value: unknown): number {
  let size: number;
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) {
      throw new RangeError('File size is outside the safe API number range.');
    }
    size = Number(value);
  } else if (typeof value === 'string' && /^\d+$/u.test(value)) {
    size = Number(value);
  } else if (typeof value === 'number') {
    size = value;
  } else {
    throw new TypeError('File size returned by the database is not numeric.');
  }
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new RangeError('File size is outside the safe API number range.');
  }
  return size;
}

export function normalizeDatabaseFileVisibility(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw new TypeError('File visibility returned by the database is invalid.');
}

export function serializeDatabaseDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      throw new TypeError('File date returned by the database is invalid.');
    }
    return value.toISOString();
  }
  // SQLite TEXT affinity can return legacy millisecond timestamps as strings.
  if (typeof value === 'string' && /^-?\d+(?:\.0+)?$/u.test(value)) {
    value = Number(value);
  }
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) return date.toISOString();
  }
  throw new TypeError('File date returned by the database is invalid.');
}
