import type {
  DatabaseManager,
  QueryAdapter,
  Row,
  SelectQuery,
} from '@nocobase/db';

import {
  DATABASE_FILE_COLUMNS,
  normalizeDatabaseFileSize,
  normalizeDatabaseFileVisibility,
  toDatabaseFileRecord,
  type DatabaseFileRow,
} from './database-file-record.js';
import type {
  DatabaseFileOrder,
  DatabaseFileScope,
  DatabaseFileScopeValue,
  DatabaseFileStoreOptions,
  FileRecord,
  FileStore,
} from './types.js';

const FILE_COLUMN_SET = new Set(DATABASE_FILE_COLUMNS);
const ORDER_FIELDS = new Set(['createdAt', 'updatedAt', 'filename', 'size']);

const DEFAULT_ORDER: Readonly<Required<DatabaseFileOrder>> = Object.freeze({
  field: 'createdAt',
  direction: 'desc',
});

const LOGICAL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function createDatabaseFileStore(
  database: DatabaseManager,
  options: DatabaseFileStoreOptions,
): FileStore {
  assertLogicalIdentifier(options.table, 'table');
  if (options.scope !== undefined && typeof options.scope !== 'function') {
    throw new TypeError('Database file scope must be a resolver function.');
  }
  const order = options.order ?? DEFAULT_ORDER;
  assertOrder(order);
  const orderDirection = order.direction ?? 'desc';
  return {
    async list(context): Promise<readonly FileRecord[]> {
      const scope = resolveScope(options, context);
      let query = selectFiles(database.query(), options.table);
      query = applyScope(query, scope);
      const rows = await query
        .orderBy(order.field, orderDirection)
        .orderBy('id', orderDirection)
        .execute<DatabaseFileRow>();
      return rows.map(toDatabaseFileRecord);
    },

    async find(id, context): Promise<FileRecord | null> {
      assertNonEmptyString(id, 'file id');
      const scope = resolveScope(options, context);
      const row = await findRow(database.query(), options.table, id, scope);
      return row ? toDatabaseFileRecord(row) : null;
    },

    async create(input, context): Promise<FileRecord> {
      const scope = resolveScope(options, context);
      return createRecord(database, options.table, input, scope);
    },

    async remove(id, context): Promise<FileRecord | null> {
      assertNonEmptyString(id, 'file id');
      const scope = resolveScope(options, context);
      return database.transaction(
        async (connection): Promise<FileRecord | null> => {
          const row = await findRow(connection.query, options.table, id, scope);
          if (!row) {
            return null;
          }
          let query = connection.query
            .deleteFrom(options.table)
            .where('id', '=', id);
          for (const [field, value] of Object.entries(scope)) {
            query = query.where(field, value === null ? 'is' : '=', value);
          }
          const result = await query.execute();
          return result.deletedCount === 1 ? toDatabaseFileRecord(row) : null;
        },
      );
    },
  };
}

async function createRecord(
  database: DatabaseManager,
  table: string,
  input: Parameters<FileStore['create']>[0],
  scope: DatabaseFileScope,
): Promise<FileRecord> {
  return database.transaction(async (connection): Promise<FileRecord> =>
    insertRecord(connection.query, table, input, scope),
  );
}

async function insertRecord(
  query: QueryAdapter,
  table: string,
  input: Parameters<FileStore['create']>[0],
  scope: DatabaseFileScope,
): Promise<FileRecord> {
  assertNonEmptyString(input.id, 'file id');
  const now = new Date();
  await query
    .insertInto(table)
    .values({
      ...input,
      size: normalizeDatabaseFileSize(input.size),
      public: normalizeDatabaseFileVisibility(input.public),
      ...scope,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  const row = await findRow(query, table, input.id, scope);
  if (!row) {
    throw new Error(`Created file record "${input.id}" could not be read.`);
  }
  return toDatabaseFileRecord(row);
}

function selectFiles(
  query: QueryAdapter,
  table: string,
): SelectQuery<DatabaseFileRow, Row> {
  return query.selectFrom<DatabaseFileRow>(table).select(DATABASE_FILE_COLUMNS);
}

async function findRow(
  queryAdapter: QueryAdapter,
  table: string,
  id: string,
  scope: DatabaseFileScope,
): Promise<DatabaseFileRow | undefined> {
  let query = selectFiles(queryAdapter, table).where('id', '=', id);
  query = applyScope(query, scope);
  return query.executeTakeFirst<DatabaseFileRow>();
}

function applyScope<TRecord extends Row, TResult extends Row>(
  query: SelectQuery<TRecord, TResult>,
  scope: DatabaseFileScope,
): SelectQuery<TRecord, TResult> {
  let scopedQuery = query;
  for (const [field, value] of Object.entries(scope)) {
    scopedQuery = scopedQuery.where(field, value === null ? 'is' : '=', value);
  }
  return scopedQuery;
}

function resolveScope(
  options: DatabaseFileStoreOptions,
  context: Parameters<NonNullable<DatabaseFileStoreOptions['scope']>>[0],
): DatabaseFileScope {
  if (!options.scope) {
    return Object.freeze({});
  }
  const scope = options.scope(context);
  if (!isPlainRecord(scope) || Object.keys(scope).length === 0) {
    throw new TypeError(
      'Database file scope must contain at least one scalar equality condition.',
    );
  }
  const normalized: Record<string, DatabaseFileScopeValue> = {};
  for (const [field, value] of Object.entries(scope)) {
    assertLogicalIdentifier(field, 'scope field');
    if (FILE_COLUMN_SET.has(field)) {
      throw new TypeError(
        `Database file scope field "${field}" conflicts with a standard file column.`,
      );
    }
    normalized[field] = assertScopeValue(field, value);
  }
  return Object.freeze(normalized);
}

function assertOrder(order: DatabaseFileOrder): void {
  if (!ORDER_FIELDS.has(order.field)) {
    throw new TypeError(
      `Invalid database file order field "${String(order.field)}".`,
    );
  }
  if (
    order.direction !== undefined &&
    order.direction !== 'asc' &&
    order.direction !== 'desc'
  ) {
    throw new TypeError(
      `Invalid database file order direction "${String(order.direction)}".`,
    );
  }
}

function assertLogicalIdentifier(value: string, label: string): void {
  if (!LOGICAL_IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(
      `Invalid database file ${label} identifier "${value}".`,
    );
  }
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`Database file ${label} must not be empty.`);
  }
}

function assertScopeValue(
  field: string,
  value: unknown,
): DatabaseFileScopeValue {
  if (value === null || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') {
      throw new TypeError(`Database file scope field "${field}" is empty.`);
    }
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new TypeError(
    `Database file scope field "${field}" must be a finite scalar value.`,
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
