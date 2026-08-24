import type { DatabaseManager, InspectedCollection } from '@nocobase/database';

export interface CreateFieldBindingRepositoryOptions {
  database: DatabaseManager;
  connection?: string;
  collection: InspectedCollection;
  recordField: string;
  fileField: string;
}

export type FieldReferenceSnapshot =
  | { recordExists: false; fileId: null }
  | { recordExists: true; fileId: string | null };

interface NativeQuery {
  select(column: string): NativeQuery;
  where(column: string, value: unknown): NativeQuery;
  whereNull(column: string): NativeQuery;
  first(): Promise<Record<string, unknown> | undefined>;
  update(values: Record<string, unknown>): Promise<number | unknown[]>;
}

interface NativeQueryClient {
  (table: string): NativeQuery;
}

export class FieldBindingRepository {
  readonly #database: DatabaseManager;
  readonly #connection: string | undefined;
  readonly #table: string;
  readonly #recordColumn: string;
  readonly #fileColumn: string;

  constructor(options: CreateFieldBindingRepositoryOptions) {
    this.#database = options.database;
    this.#connection = options.connection;
    this.#table = options.collection.tableName;
    this.#recordColumn = findColumn(options.collection, options.recordField);
    this.#fileColumn = findColumn(options.collection, options.fileField);
  }

  async get(recordId: string): Promise<FieldReferenceSnapshot> {
    const client = await this.#client();
    const row = await client(this.#table)
      .select(this.#fileColumn)
      .where(this.#recordColumn, recordId)
      .first();
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
  ): Promise<boolean> {
    const client = await this.#client();
    let query = client(this.#table).where(this.#recordColumn, recordId);
    query =
      expectedFileId === null
        ? query.whereNull(this.#fileColumn)
        : query.where(this.#fileColumn, expectedFileId);
    const result = await query.update({ [this.#fileColumn]: nextFileId });
    return (typeof result === 'number' ? result : result.length) === 1;
  }

  #client(): Promise<NativeQueryClient> {
    return this.#database
      .connection(this.#connection)
      .client<NativeQueryClient>();
  }
}

export function createFieldBindingRepository(
  options: CreateFieldBindingRepositoryOptions,
): FieldBindingRepository {
  return new FieldBindingRepository(options);
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

function readNullableFileId(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !value || value.length > 64) {
    throw new Error('A field binding record contains an invalid fileId.');
  }
  return value;
}
