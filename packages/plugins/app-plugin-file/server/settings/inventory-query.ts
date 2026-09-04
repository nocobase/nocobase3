import type { DatabaseManager, Row } from '@nocobase/db';

import type {
  FileInventoryFilesResponse,
  FileInventoryItem,
} from '../../shared/settings/inventory.js';
import {
  normalizeDatabaseFileSize,
  normalizeDatabaseFileVisibility,
  serializeDatabaseDate,
} from '../database-file-record.js';
import type { RegisteredDatabaseFileSource } from './source-registry.js';

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
  readonly pageSize: number;
  readonly cursor?: string;
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
  let query = database
    .query()
    .selectFrom<FileInventoryRow>(source.table)
    .select(INVENTORY_COLUMNS)
    .orderBy('id', 'desc')
    .limit(options.pageSize + 1);
  if (options.cursor !== undefined) {
    query = query.where('id', '<', options.cursor);
  }
  const rows = await query.execute<FileInventoryRow>();
  const hasNextPage = rows.length > options.pageSize;
  const pageRows = rows.slice(0, options.pageSize);
  const nextCursor = hasNextPage ? pageRows.at(-1)?.id : undefined;
  return {
    data: pageRows.map(toInventoryItem),
    meta: {
      pageSize: options.pageSize,
      hasNextPage,
      ...(nextCursor === undefined ? {} : { nextCursor }),
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
