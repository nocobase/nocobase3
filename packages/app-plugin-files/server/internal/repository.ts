import type {
  DatabaseConnection,
  DatabaseManager,
  QueryAdapter,
} from '@nocobase/app-database';

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

export interface ExpiredPendingRecordInput {
  id: string;
  uploadExpiresAt: Date;
  cutoff: Date;
  now: Date;
}

export interface TemporaryCleanupCandidate {
  id: string;
  status: 'pending' | 'failed';
  uploadExpiresAt: Date;
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
        temporaryCleanupCompletedAt: null,
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
  ): Promise<Array<FileRecord | undefined>> {
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
    return ids.map((id) => recordsById.get(id));
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
      .where('uploadExpiresAt', '>', input.now)
      .execute();
    return result.updatedCount === 1;
  }

  async listTemporaryCleanupCandidates(
    cutoff: Date,
    limit: number,
  ): Promise<TemporaryCleanupCandidate[]> {
    const rows = await this.#query()
      .selectFrom(FILES_TABLE)
      .selectAll()
      .where((eb) =>
        eb.or([
          eb.and([
            eb('status', '=', 'pending'),
            eb('uploadExpiresAt', '<=', cutoff),
          ]),
          eb.and([
            eb('status', '=', 'failed'),
            eb('uploadExpiresAt', '<=', cutoff),
            eb('temporaryCleanupCompletedAt', 'is', null),
          ]),
        ]),
      )
      .orderBy('uploadExpiresAt', 'asc')
      .orderBy('id', 'asc')
      .limit(limit)
      .execute<Record<string, unknown>>();
    return rows.map((row) => {
      const record = readFileRecord(row);
      if (record.status === 'ready') {
        throw new Error(
          'A ready file cannot be a temporary cleanup candidate.',
        );
      }
      return {
        id: record.id,
        status: record.status,
        uploadExpiresAt: record.uploadExpiresAt,
      };
    });
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

  async failExpiredPending(
    input: ExpiredPendingRecordInput,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    const result = await this.#query(connection)
      .updateTable(FILES_TABLE)
      .set({ status: 'failed', updatedAt: input.now })
      .where('id', '=', input.id)
      .where('status', '=', 'pending')
      .where('uploadExpiresAt', '=', input.uploadExpiresAt)
      .where('uploadExpiresAt', '<=', input.cutoff)
      .execute();
    return result.updatedCount === 1;
  }

  async markTemporaryCleanupCompleted(id: string, now: Date): Promise<boolean> {
    const result = await this.#query()
      .updateTable(FILES_TABLE)
      .set({ temporaryCleanupCompletedAt: now, updatedAt: now })
      .where('id', '=', id)
      .where('status', '=', 'failed')
      .where('uploadExpiresAt', '<=', now)
      .where('temporaryCleanupCompletedAt', 'is', null)
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
