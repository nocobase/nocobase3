import type {
  DatabaseConnection,
  DatabaseManager,
  QueryAdapter,
} from '@nocobase/app-database';

export interface CreateFieldBindingRepositoryOptions {
  database: DatabaseManager;
  connection?: string;
  collection: string;
  recordField: string;
  fileField: string;
}

export type FieldReferenceSnapshot =
  | { recordExists: false; fileId: null }
  | { recordExists: true; fileId: string | null };

export class FieldBindingRepository {
  readonly #database: DatabaseManager;
  readonly #connection: string | undefined;
  readonly #table: string;
  readonly #recordColumn: string;
  readonly #fileColumn: string;

  constructor(options: CreateFieldBindingRepositoryOptions) {
    this.#database = options.database;
    this.#connection = options.connection;
    this.#table = options.collection;
    this.#recordColumn = options.recordField;
    this.#fileColumn = options.fileField;
  }

  async get(
    recordId: string,
    connection?: DatabaseConnection,
  ): Promise<FieldReferenceSnapshot> {
    const row = await this.#query(connection)
      .selectFrom(this.#table)
      .select(this.#fileColumn)
      .where(this.#recordColumn, '=', recordId)
      .executeTakeFirst<Record<string, unknown>>();
    if (!row) {
      return { recordExists: false, fileId: null };
    }
    return {
      recordExists: true,
      fileId: readNullableFileId(row[this.#fileColumn]),
    };
  }

  async compareAndSet(
    recordId: string,
    expectedFileId: string | null,
    nextFileId: string | null,
    connection?: DatabaseConnection,
  ): Promise<boolean> {
    let query = this.#query(connection)
      .updateTable(this.#table)
      .set({ [this.#fileColumn]: nextFileId })
      .where(this.#recordColumn, '=', recordId);
    query =
      expectedFileId === null
        ? query.where(this.#fileColumn, 'is', null)
        : query.where(this.#fileColumn, '=', expectedFileId);
    const result = await query.execute();
    return result.updatedCount === 1;
  }

  #query(connection?: DatabaseConnection): QueryAdapter {
    return connection?.query ?? this.#database.query(this.#connection);
  }
}

export function createFieldBindingRepository(
  options: CreateFieldBindingRepositoryOptions,
): FieldBindingRepository {
  return new FieldBindingRepository(options);
}

function readNullableFileId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw new Error('A field binding record contains an invalid fileId.');
  }
  return value;
}
