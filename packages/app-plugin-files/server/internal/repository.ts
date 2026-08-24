import type {
  DatabaseConnection,
  DatabaseManager,
  QueryAdapter,
} from '@nocobase/database';

import {
  readFileRecord,
  type FileRecord,
  type PublicDisposition,
} from './model.js';

const FILES_TABLE = 'files';

interface CreatePendingRecordInput {
  id: string;
  name: string;
  uploadExpiresAt: Date;
  now: Date;
}

interface CompletePendingRecordInput {
  id: string;
  storageKey: string;
  size: number;
  contentType: string | null;
  now: Date;
}

interface PublicAccessRecordInput {
  id: string;
  tokenHash: string;
  disposition: PublicDisposition;
  now: Date;
}

export class FilesRepository {
  readonly #database: DatabaseManager;
  readonly #connectionName: string | undefined;

  constructor(database: DatabaseManager, connectionName?: string) {
    this.#database = database;
    this.#connectionName = connectionName;
  }

  transaction<T>(
    callback: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T> {
    return this.#database.transaction(callback, this.#connectionName);
  }

  async createPending(
    input: CreatePendingRecordInput,
    connection?: DatabaseConnection,
  ): Promise<FileRecord> {
    await this.#query(connection)
      .insertInto(FILES_TABLE)
      .values({
        id: input.id,
        status: 'pending',
        storageKey: null,
        name: input.name,
        size: null,
        contentType: null,
        uploadExpiresAt: input.uploadExpiresAt,
        publicTokenHash: null,
        publicDisposition: null,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .execute();

    return this.getRequired(input.id, connection);
  }

  async get(
    id: string,
    connection?: DatabaseConnection,
  ): Promise<FileRecord | undefined> {
    const row = await this.#query(connection)
      .selectFrom(FILES_TABLE)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst<Record<string, unknown>>();
    return row === undefined ? undefined : readFileRecord(row);
  }

  async getRequired(
    id: string,
    connection?: DatabaseConnection,
  ): Promise<FileRecord> {
    const record = await this.get(id, connection);
    if (!record) {
      throw new Error(`Files record "${id}" was not found.`);
    }
    return record;
  }

  async getMany(
    ids: readonly string[],
    connection?: DatabaseConnection,
  ): Promise<FileRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.#query(connection)
      .selectFrom(FILES_TABLE)
      .selectAll()
      .where('id', 'in', [...new Set(ids)])
      .execute<Record<string, unknown>>();
    const recordsById = new Map(
      rows.map((row) => {
        const record = readFileRecord(row);
        return [record.id, record] as const;
      }),
    );
    return ids.flatMap((id) => {
      const record = recordsById.get(id);
      return record ? [record] : [];
    });
  }

  async completePending(
    input: CompletePendingRecordInput,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({
        status: 'ready',
        storageKey: input.storageKey,
        size: input.size,
        contentType: input.contentType,
        updatedAt: input.now,
      })
      .where('id', '=', input.id)
      .where('status', '=', 'pending')
      .execute();
    return result.updatedCount === 1;
  }

  async failPending(
    id: string,
    now: Date,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({ status: 'failed', updatedAt: now })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .execute();
    return result.updatedCount === 1;
  }

  async setPublicAccess(
    input: PublicAccessRecordInput,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({
        publicTokenHash: input.tokenHash,
        publicDisposition: input.disposition,
        updatedAt: input.now,
      })
      .where('id', '=', input.id)
      .where('status', '=', 'ready')
      .execute();
    return result.updatedCount === 1;
  }

  async enablePublicAccess(
    input: PublicAccessRecordInput,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({
        publicTokenHash: input.tokenHash,
        publicDisposition: input.disposition,
        updatedAt: input.now,
      })
      .where('id', '=', input.id)
      .where('status', '=', 'ready')
      .where('publicTokenHash', 'is', null)
      .where('publicDisposition', 'is', null)
      .execute();
    return result.updatedCount === 1;
  }

  async resetPublicAccess(
    input: PublicAccessRecordInput,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({
        publicTokenHash: input.tokenHash,
        publicDisposition: input.disposition,
        updatedAt: input.now,
      })
      .where('id', '=', input.id)
      .where('status', '=', 'ready')
      .where('publicTokenHash', 'is not', null)
      .where('publicDisposition', 'is not', null)
      .execute();
    return result.updatedCount === 1;
  }

  async clearPublicAccess(
    id: string,
    now: Date,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({
        publicTokenHash: null,
        publicDisposition: null,
        updatedAt: now,
      })
      .where('id', '=', id)
      .where('status', '=', 'ready')
      .execute();
    return result.updatedCount === 1;
  }

  async findExpiredPending(
    before: Date,
    limit: number,
    connection?: DatabaseConnection,
  ): Promise<FileRecord[]> {
    const rows = await this.#query(connection)
      .selectFrom(FILES_TABLE)
      .selectAll()
      .where('status', '=', 'pending')
      .where('uploadExpiresAt', '<=', before)
      .orderBy('uploadExpiresAt', 'asc')
      .orderBy('id', 'asc')
      .limit(limit)
      .execute<Record<string, unknown>>();
    return rows.map(readFileRecord);
  }

  async deleteExact(
    record: FileRecord,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    let query = this.#query(connection)
      .deleteFrom(FILES_TABLE)
      .where('id', '=', record.id)
      .where('status', '=', record.status);
    query =
      record.storageKey === null
        ? query.where('storageKey', 'is', null)
        : query.where('storageKey', '=', record.storageKey);
    const result = await query.execute();
    return result.deletedCount === 1;
  }

  #query(connection?: DatabaseConnection): QueryAdapter {
    return connection?.query ?? this.#database.query(this.#connectionName);
  }
}

export function createFilesRepository(
  database: DatabaseManager,
  connectionName?: string,
): FilesRepository {
  return new FilesRepository(database, connectionName);
}
