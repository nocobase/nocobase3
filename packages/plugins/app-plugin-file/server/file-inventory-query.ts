import type { DatabaseManager, Row } from '@nocobase/db';

import type {
  FileInventoryFilesResponse,
  FileInventoryItem,
  FileInventorySourceSummary,
} from '../shared/inventory.js';
import {
  DATABASE_FILE_COLUMNS,
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

interface CountRow extends Row {
  count: number | string | bigint;
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

export async function summarizeDatabaseFileSource(
  database: DatabaseManager,
  source: RegisteredDatabaseFileSource,
): Promise<FileInventorySourceSummary> {
  try {
    await database
      .query()
      .selectFrom(source.table)
      .select(DATABASE_FILE_COLUMNS)
      .limit(0)
      .execute();
    const count = await countRows(database, source.table);
    return {
      id: source.id,
      table: source.table,
      count,
      status: 'available',
    };
  } catch (error) {
    console.error('File inventory source summary failed.', {
      table: source.table,
      error,
    });
    return {
      id: source.id,
      table: source.table,
      count: null,
      status: 'unavailable',
    };
  }
}

export async function listDatabaseFileSourceItems(
  database: DatabaseManager,
  source: RegisteredDatabaseFileSource,
  options: FileInventoryPageOptions,
): Promise<FileInventoryFilesResponse> {
  const offset = (options.page - 1) * options.pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('File inventory offset is outside the safe range.');
  }
  const total = await countRows(database, source.table);
  const totalPages = Math.ceil(total / options.pageSize);
  if (offset >= total) {
    return {
      data: [],
      meta: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        totalPages,
      },
    };
  }
  const rows = await database
    .query()
    .selectFrom<FileInventoryRow>(source.table)
    .select(INVENTORY_COLUMNS)
    .orderBy('createdAt', 'desc')
    .orderBy('id', 'desc')
    .limit(options.pageSize)
    .offset(offset)
    .execute<FileInventoryRow>();
  return {
    data: rows.map(toInventoryItem),
    meta: {
      page: options.page,
      pageSize: options.pageSize,
      total,
      totalPages,
    },
  };
}

async function countRows(
  database: DatabaseManager,
  table: string,
): Promise<number> {
  const row = await database
    .query()
    .selectFrom(table)
    .select((expression) => [expression.fn.countAll().as('count')])
    .executeTakeFirst<CountRow>();
  return normalizeSafeCount(row?.count ?? 0);
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

function normalizeSafeCount(value: number | string | bigint): number {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new RangeError('File record count is outside the safe API range.');
  }
  return normalized;
}
