import type { DatabaseManager, Row } from '@nocobase/db';

import type {
  FileInventoryFilesResponse,
  FileInventoryItem,
} from '../shared/inventory.js';
import {
  normalizeDatabaseFileSize,
  normalizeDatabaseFileVisibility,
  serializeDatabaseDate,
} from './database-file-record.js';
import type { RegisteredDatabaseFileSource } from './file-source-registry.js';

interface FileInventoryRow extends Row {
  id: string;
  disk: string;
  filename: string;
  mimeType: string;
  size: unknown;
  public: unknown;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface FileInventoryPageOptions {
  readonly page: number;
  readonly pageSize: number;
}

const INVENTORY_COLUMNS: readonly string[] = Object.freeze([
  'id',
  'disk',
  'filename',
  'mimeType',
  'size',
  'public',
  'createdAt',
  'updatedAt',
]);

export async function listDatabaseFileSourceItems(
  database: DatabaseManager,
  source: RegisteredDatabaseFileSource,
  options: FileInventoryPageOptions,
): Promise<FileInventoryFilesResponse> {
  const offset = (options.page - 1) * options.pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('File inventory offset is outside the safe range.');
  }
  const rows = await database
    .query()
    .selectFrom<FileInventoryRow>(source.table)
    .select(INVENTORY_COLUMNS)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .limit(options.pageSize + 1)
    .offset(offset)
    .execute<FileInventoryRow>();
  const hasNextPage = rows.length > options.pageSize;
  return {
    data: rows.slice(0, options.pageSize).map(toInventoryItem),
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      hasNextPage,
    },
  };
}

function toInventoryItem(row: FileInventoryRow): FileInventoryItem {
  return {
    id: row.id,
    disk: row.disk,
    filename: row.filename,
    mimeType: row.mimeType,
    size: normalizeDatabaseFileSize(row.size),
    public: normalizeDatabaseFileVisibility(row.public),
    createdAt: serializeDatabaseDate(row.createdAt),
    updatedAt: serializeDatabaseDate(row.updatedAt),
  };
}
