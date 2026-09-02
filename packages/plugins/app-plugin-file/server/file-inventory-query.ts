import type { DatabaseManager, Row } from '@nocobase/db';

import type {
  FileInventoryFilesResponse,
  FileInventoryItem,
  FileInventorySourceSummary,
} from '../shared/inventory.js';
import type { RegisteredDatabaseFileSource } from './file-source-registry.js';

interface FileInventoryRow extends Row {
  id: string;
  disk: string;
  filename: string;
  mimeType: string;
  size: unknown;
  public: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface CountRow extends Row {
  count: number | string | bigint;
}

export interface FileInventoryPageOptions {
  readonly page: number;
  readonly pageSize: number;
}

const VALIDATION_COLUMNS: readonly string[] = Object.freeze([
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

const SOURCE_UNAVAILABLE_MESSAGE = 'The registered file table is unavailable.';

export async function summarizeDatabaseFileSource(
  database: DatabaseManager,
  source: RegisteredDatabaseFileSource,
): Promise<FileInventorySourceSummary> {
  try {
    await database
      .query()
      .selectFrom(source.table)
      .select(VALIDATION_COLUMNS)
      .limit(1)
      .execute();
    const count = await countRows(database, source.table);
    return {
      id: source.id,
      table: source.table,
      audiences: source.audiences,
      registrations: source.registrations,
      scoped: source.scoped,
      count,
      status: 'available',
    };
  } catch {
    return {
      id: source.id,
      table: source.table,
      audiences: source.audiences,
      registrations: source.registrations,
      scoped: source.scoped,
      count: null,
      status: 'unavailable',
      error: SOURCE_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function listDatabaseFileSourceItems(
  database: DatabaseManager,
  source: RegisteredDatabaseFileSource,
  options: FileInventoryPageOptions,
): Promise<FileInventoryFilesResponse> {
  const total = await countRows(database, source.table);
  const offset = (options.page - 1) * options.pageSize;
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
      totalPages: Math.ceil(total / options.pageSize),
    },
  };
}

export function fileSourceUnavailableMessage(): string {
  return SOURCE_UNAVAILABLE_MESSAGE;
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
  return toSafeCount(row?.count ?? 0);
}

function toInventoryItem(row: FileInventoryRow): FileInventoryItem {
  return {
    id: row.id,
    disk: row.disk,
    filename: row.filename,
    mimeType: row.mimeType,
    size: toSafeInteger(row.size, 'File size'),
    public: toBoolean(row.public),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSafeCount(value: number | string | bigint): number {
  return toSafeInteger(value, 'File record count');
}

function toSafeInteger(value: unknown, label: string): number {
  let normalized: number;
  if (typeof value === 'bigint') normalized = Number(value);
  else if (typeof value === 'string' && /^\d+$/u.test(value)) {
    normalized = Number(value);
  } else if (typeof value === 'number') normalized = value;
  else throw new TypeError(`${label} returned by the database is not numeric.`);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new RangeError(`${label} is outside the safe API number range.`);
  }
  return normalized;
}

function toBoolean(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw new TypeError('File visibility returned by the database is invalid.');
}
