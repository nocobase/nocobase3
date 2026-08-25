import type {
  DatabaseConnection,
  DatabaseManager,
  InspectedCollection,
  QueryAdapter,
} from '@nocobase/app-database';

export interface CreateRelationBindingRepositoryOptions {
  database: DatabaseManager;
  connection?: string;
  collection: InspectedCollection;
  parentCollection: InspectedCollection;
  parentField: string;
  recordField: string;
}

export interface RelationBindingRow {
  id: string;
  fileId: string;
  slot: number;
  reservationExpiresAt: Date | null;
}

export interface CreateRelationReservationInput {
  id: string;
  recordId: string;
  fileId: string;
  slot: number;
  reservationExpiresAt: Date;
  now: Date;
}

export type ReserveRelationSlotResult =
  | { outcome: 'reserved'; row: RelationBindingRow }
  | { outcome: 'full' }
  | { outcome: 'record-missing' };

export type CommitRelationBindingResult =
  | { outcome: 'committed'; row: RelationBindingRow }
  | { outcome: 'conflict' }
  | { outcome: 'record-missing' };

export class RelationBindingRepository {
  readonly #database: DatabaseManager;
  readonly #connectionName: string | undefined;
  readonly #table: string;
  readonly #parentTable: string;
  readonly #idColumn: string;
  readonly #parentColumn: string;
  readonly #recordColumn: string;
  readonly #fileColumn: string;
  readonly #slotColumn: string;
  readonly #reservationColumn: string;
  readonly #createdAtColumn: string;
  readonly #updatedAtColumn: string;

  constructor(options: CreateRelationBindingRepositoryOptions) {
    this.#database = options.database;
    this.#connectionName = options.connection;
    this.#table = options.collection.tableName;
    this.#parentTable = options.parentCollection.tableName;
    this.#idColumn = findColumn(options.collection, 'id');
    this.#parentColumn = findColumn(
      options.parentCollection,
      options.parentField,
    );
    this.#recordColumn = findColumn(options.collection, options.recordField);
    this.#fileColumn = findColumn(options.collection, 'fileId');
    this.#slotColumn = findColumn(options.collection, 'slot');
    this.#reservationColumn = findColumn(
      options.collection,
      'reservationExpiresAt',
    );
    this.#createdAtColumn = findColumn(options.collection, 'createdAt');
    this.#updatedAtColumn = findColumn(options.collection, 'updatedAt');
  }

  async parentExists(
    recordId: string,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    return this.#query(connection)
      .selectFrom(this.#parentTable)
      .select(this.#parentColumn)
      .where(this.#parentColumn, '=', recordId)
      .exists();
  }

  async listExpiredFileIds(recordId: string, now: Date): Promise<string[]> {
    const candidates = await this.#query()
      .selectFrom(this.#table)
      .select(this.#fileColumn)
      .where(this.#recordColumn, '=', recordId)
      .where(this.#reservationColumn, 'is not', null)
      .where(this.#reservationColumn, '<=', now)
      .execute<Record<string, unknown>>();
    return candidates.map((candidate) =>
      readFileId(candidate[this.#fileColumn]),
    );
  }

  async list(recordId: string): Promise<RelationBindingRow[]> {
    const rows = await this.#query()
      .selectFrom(this.#table)
      .select([
        this.#idColumn,
        this.#fileColumn,
        this.#slotColumn,
        this.#reservationColumn,
      ])
      .where(this.#recordColumn, '=', recordId)
      .where(this.#reservationColumn, 'is', null)
      .orderBy(this.#slotColumn, 'asc')
      .execute<Record<string, unknown>>();
    return rows.map((row) => this.#readRow(row));
  }

  async get(
    recordId: string,
    fileId: string,
    connection?: DatabaseConnection,
  ): Promise<RelationBindingRow | undefined> {
    const row = await this.#selectRow(
      this.#query(connection),
      recordId,
      fileId,
    );
    return row === undefined ? undefined : this.#readRow(row);
  }

  async reserve(
    input: Omit<CreateRelationReservationInput, 'slot'>,
    maxFiles: number,
  ): Promise<ReserveRelationSlotResult> {
    const maxAttempts = maxFiles * 2 + 1;
    let lastRetryableError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const result = await this.#database.transaction(
          async (connection): Promise<ReserveRelationSlotResult> => {
            if (!(await this.#parentExists(connection.query, input.recordId))) {
              return { outcome: 'record-missing' };
            }
            const occupied = await connection.query
              .selectFrom(this.#table)
              .select(this.#slotColumn)
              .where(this.#recordColumn, '=', input.recordId)
              .orderBy(this.#slotColumn, 'asc')
              .execute<Record<string, unknown>>();
            const occupiedSlots = new Set(
              occupied.map((row) => readSlot(row[this.#slotColumn])),
            );
            const slot = findAvailableSlot(occupiedSlots, maxFiles);
            if (slot === undefined) {
              return { outcome: 'full' };
            }
            await connection.query
              .insertInto(this.#table)
              .values({
                [this.#idColumn]: input.id,
                [this.#recordColumn]: input.recordId,
                [this.#fileColumn]: input.fileId,
                [this.#slotColumn]: slot,
                [this.#reservationColumn]: input.reservationExpiresAt,
                [this.#createdAtColumn]: input.now,
                [this.#updatedAtColumn]: input.now,
              })
              .execute();
            return {
              outcome: 'reserved',
              row: {
                id: input.id,
                fileId: input.fileId,
                slot,
                reservationExpiresAt: input.reservationExpiresAt,
              },
            };
          },
          this.#connectionName,
        );
        return result;
      } catch (error) {
        if (!isRetryableSlotConflict(error)) {
          throw error;
        }
        lastRetryableError = error;
      }
    }
    throw lastRetryableError;
  }

  async commit(
    recordId: string,
    fileId: string,
    replaceFileId: string | null,
    now: Date,
    connection?: DatabaseConnection,
  ): Promise<CommitRelationBindingResult> {
    const commit = async (
      activeConnection: DatabaseConnection,
    ): Promise<CommitRelationBindingResult> => {
      if (!(await this.#parentExists(activeConnection.query, recordId))) {
        return { outcome: 'record-missing' };
      }
      const current = await this.#selectRow(
        activeConnection.query,
        recordId,
        fileId,
      );
      if (current) {
        const row = this.#readRow(current);
        if (row.reservationExpiresAt !== null) {
          await activeConnection.query
            .updateTable(this.#table)
            .set({
              [this.#reservationColumn]: null,
              [this.#updatedAtColumn]: now,
            })
            .where(this.#recordColumn, '=', recordId)
            .where(this.#fileColumn, '=', fileId)
            .execute();
          return {
            outcome: 'committed',
            row: { ...row, reservationExpiresAt: null },
          };
        }
        return { outcome: 'committed', row };
      }
      if (replaceFileId === null) {
        return { outcome: 'conflict' };
      }
      const replacement = await this.#selectRow(
        activeConnection.query,
        recordId,
        replaceFileId,
      );
      if (!replacement) {
        return { outcome: 'conflict' };
      }
      const replacementRow = this.#readRow(replacement);
      if (replacementRow.reservationExpiresAt !== null) {
        return { outcome: 'conflict' };
      }
      const updated = await activeConnection.query
        .updateTable(this.#table)
        .set({
          [this.#fileColumn]: fileId,
          [this.#reservationColumn]: null,
          [this.#updatedAtColumn]: now,
        })
        .where(this.#recordColumn, '=', recordId)
        .where(this.#fileColumn, '=', replaceFileId)
        .where(this.#idColumn, '=', replacementRow.id)
        .execute();
      if (updated.updatedCount !== 1) {
        return { outcome: 'conflict' };
      }
      return {
        outcome: 'committed',
        row: {
          ...replacementRow,
          fileId,
          reservationExpiresAt: null,
        },
      };
    };
    return connection
      ? commit(connection)
      : this.#database.transaction(commit, this.#connectionName);
  }

  async delete(
    recordId: string,
    fileId: string,
    requireReservation: boolean,
  ): Promise<boolean> {
    return this.#database.transaction(async (connection): Promise<boolean> => {
      let deletion = connection.query
        .deleteFrom(this.#table)
        .where(this.#recordColumn, '=', recordId)
        .where(this.#fileColumn, '=', fileId);
      deletion = requireReservation
        ? deletion.where(this.#reservationColumn, 'is not', null)
        : deletion.where(this.#reservationColumn, 'is', null);
      const result = await deletion.execute();
      return result.deletedCount === 1;
    }, this.#connectionName);
  }

  async cancelPending(
    recordId: string,
    fileId: string,
    replaceFileId: string | null,
    connection?: DatabaseConnection,
  ): Promise<void> {
    const cancel = async (
      activeConnection: DatabaseConnection,
    ): Promise<void> => {
      if (replaceFileId === null) {
        await activeConnection.query
          .deleteFrom(this.#table)
          .where(this.#recordColumn, '=', recordId)
          .where(this.#fileColumn, '=', fileId)
          .where(this.#reservationColumn, 'is not', null)
          .execute();
        return;
      }
    };
    if (connection) {
      await cancel(connection);
      return;
    }
    await this.#database.transaction(cancel, this.#connectionName);
  }

  async hasForOtherRecord(recordId: string, fileId: string): Promise<boolean> {
    return this.#query()
      .selectFrom(this.#table)
      .select(this.#idColumn)
      .where(this.#recordColumn, '!=', recordId)
      .where(this.#fileColumn, '=', fileId)
      .exists();
  }

  #query(connection?: DatabaseConnection): QueryAdapter {
    return connection?.query ?? this.#database.query(this.#connectionName);
  }

  #parentExists(query: QueryAdapter, recordId: string): Promise<boolean> {
    return query
      .selectFrom(this.#parentTable)
      .select(this.#parentColumn)
      .where(this.#parentColumn, '=', recordId)
      .exists();
  }

  #selectRow(
    query: QueryAdapter,
    recordId: string,
    fileId: string,
  ): Promise<Record<string, unknown> | undefined> {
    return query
      .selectFrom(this.#table)
      .select([
        this.#idColumn,
        this.#fileColumn,
        this.#slotColumn,
        this.#reservationColumn,
      ])
      .where(this.#recordColumn, '=', recordId)
      .where(this.#fileColumn, '=', fileId)
      .executeTakeFirst<Record<string, unknown>>();
  }

  #readRow(row: Record<string, unknown>): RelationBindingRow {
    return {
      id: readId(row[this.#idColumn]),
      fileId: readFileId(row[this.#fileColumn]),
      slot: readSlot(row[this.#slotColumn]),
      reservationExpiresAt: readNullableDate(row[this.#reservationColumn]),
    };
  }
}

export function createRelationBindingRepository(
  options: CreateRelationBindingRepositoryOptions,
): RelationBindingRepository {
  return new RelationBindingRepository(options);
}

function findColumn(
  collection: InspectedCollection,
  fieldName: string,
): string {
  const field = collection.fields.find(
    (candidate) => candidate.definition.name === fieldName,
  );
  if (!field) {
    throw new Error(
      `Collection "${collection.definition.name ?? collection.tableName}" field "${fieldName}" is unavailable.`,
    );
  }
  return field.columnName;
}

function findAvailableSlot(
  occupied: ReadonlySet<number>,
  maxFiles: number,
): number | undefined {
  for (let slot = 1; slot <= maxFiles; slot += 1) {
    if (!occupied.has(slot)) {
      return slot;
    }
  }
  return undefined;
}

function isRetryableSlotConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as Record<string, unknown>;
  return (
    record.code === '23505' ||
    record.code === '40001' ||
    record.code === '40P01' ||
    record.code === 'SQLITE_BUSY' ||
    record.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    record.code === 'ER_DUP_ENTRY' ||
    record.errno === 1062 ||
    record.errno === 1213 ||
    record.errno === 2067 ||
    record.errno === 5
  );
}

function readId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw new Error('A relation binding row contains an invalid id.');
  }
  return value;
}

function readFileId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw new Error('A relation binding row contains an invalid fileId.');
  }
  return value;
}

function readSlot(value: unknown): number {
  const slot = Number(value);
  if (!Number.isSafeInteger(slot) || slot <= 0) {
    throw new Error('A relation binding row contains an invalid slot.');
  }
  return slot;
}

function readNullableDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    !(value instanceof Date) &&
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    throw new Error(
      'A relation binding row contains an invalid reservation expiry.',
    );
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(
      'A relation binding row contains an invalid reservation expiry.',
    );
  }
  return date;
}
