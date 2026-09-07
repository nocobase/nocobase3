import type { Knex } from 'knex';
import type {
  CollectionMetadataStore,
  CollectionMetadataPage,
  CollectionMetadataStoreCapabilities,
  DeleteCollectionMetadataOptions,
  ListCollectionMetadataOptions,
  PutCollectionMetadataOptions,
} from '../document-store.js';
import {
  CollectionMetadataConflictError,
  CollectionMetadataStoreOptionsError,
} from '../document-store-errors.js';
import {
  cloneStoredCollectionMetadata,
  createCollectionMetadataPage,
  resolveCollectionMetadataListOptions,
  validateCollectionMetadataStoreName,
  validateDeleteCollectionMetadataOptions,
  validatePutCollectionMetadataOptions,
} from '../document-store-helpers.js';
import type {
  CollectionMetadataDocument,
  StoredCollectionMetadata,
} from '../document.js';
import { validateCollectionMetadataDocument } from '../validation.js';

export const DEFAULT_COLLECTION_METADATA_TABLE =
  '__nocobase_collection_metadata';

export interface DatabaseCollectionMetadataStoreOptions {
  readonly resolveClient: () => Promise<Knex>;
  readonly tableName?: string;
  readonly schema?: string;
}

interface CollectionMetadataRow {
  readonly name: string;
  readonly document: unknown;
  readonly revision: number | string;
}

export class DatabaseCollectionMetadataStore implements CollectionMetadataStore {
  readonly capabilities: CollectionMetadataStoreCapabilities = Object.freeze({
    writable: true,
    optimisticConcurrency: true,
  });

  private initializationPromise?: Promise<void>;

  get tableName(): string {
    return this.options.tableName ?? DEFAULT_COLLECTION_METADATA_TABLE;
  }

  isInternalPhysicalCollection(identity: {
    readonly tableName: string;
    readonly schema: string;
  }): boolean {
    return (
      identity.tableName === this.tableName &&
      (this.options.schema === undefined ||
        identity.schema === this.options.schema)
    );
  }

  constructor(
    private readonly options: DatabaseCollectionMetadataStoreOptions,
  ) {}

  withClient(
    resolveClient: () => Promise<Knex>,
  ): DatabaseCollectionMetadataStore {
    return new DatabaseCollectionMetadataStore({
      ...this.options,
      resolveClient,
    });
  }

  async initialize(): Promise<void> {
    if (!this.initializationPromise) {
      const initializing = this.createTable();
      this.initializationPromise = initializing.catch((error: unknown) => {
        this.initializationPromise = undefined;
        throw error;
      });
    }
    await this.initializationPromise;
  }

  async get(name: string): Promise<StoredCollectionMetadata | undefined> {
    validateCollectionMetadataStoreName(name);
    await this.initialize();
    const knex = await this.options.resolveClient();
    const row = (await this.table(knex)
      .select(['name', 'document', 'revision'])
      .where({ name })
      .first()) as CollectionMetadataRow | undefined;
    return row ? this.fromRow(row) : undefined;
  }

  async list(
    options: ListCollectionMetadataOptions = {},
  ): Promise<CollectionMetadataPage> {
    const { limit, after } = resolveCollectionMetadataListOptions(options);
    await this.initialize();
    const knex = await this.options.resolveClient();
    let query = this.table(knex)
      .select(['name', 'document', 'revision'])
      .orderBy('name', 'asc')
      .limit(limit + 1);
    if (after) query = query.where('name', '>', after);
    const rows = (await query) as CollectionMetadataRow[];
    return createCollectionMetadataPage(
      rows.map((row) => this.fromRow(row)),
      limit,
    );
  }

  async put(
    input: CollectionMetadataDocument,
    options: PutCollectionMetadataOptions,
  ): Promise<StoredCollectionMetadata> {
    validatePutCollectionMetadataOptions(options);
    if (
      options.expectedRevision !== null &&
      !validDatabaseUpdateRevision(options.expectedRevision)
    ) {
      throw new CollectionMetadataStoreOptionsError(
        'Database Collection Metadata Store put() expectedRevision must be a positive safe integer smaller than Number.MAX_SAFE_INTEGER, or null.',
      );
    }
    const document = validateCollectionMetadataDocument(input);
    await this.initialize();
    const knex = await this.options.resolveClient();
    if (options.expectedRevision === null) {
      try {
        await this.table(knex).insert({
          name: document.name,
          document: JSON.stringify(document),
          revision: 1,
          created_at: new Date(),
          updated_at: new Date(),
        });
      } catch (error) {
        const actual = await this.actualRevision(knex, document.name);
        if (actual !== null) {
          throw new CollectionMetadataConflictError(
            document.name,
            null,
            actual,
          );
        }
        throw error;
      }
      return cloneStoredCollectionMetadata({ document, revision: 1 });
    }

    const nextRevision = options.expectedRevision + 1;
    const updated = await this.table(knex)
      .where({
        name: document.name,
        revision: options.expectedRevision,
      })
      .update({
        document: JSON.stringify(document),
        revision: nextRevision,
        updated_at: new Date(),
      });
    if (Number(updated) !== 1) {
      throw new CollectionMetadataConflictError(
        document.name,
        options.expectedRevision,
        await this.actualRevision(knex, document.name),
      );
    }
    return cloneStoredCollectionMetadata({ document, revision: nextRevision });
  }

  async delete(
    name: string,
    options: DeleteCollectionMetadataOptions,
  ): Promise<void> {
    validateCollectionMetadataStoreName(name);
    validateDeleteCollectionMetadataOptions(options);
    if (!validDatabaseRevision(options.expectedRevision)) {
      throw new CollectionMetadataStoreOptionsError(
        'Database Collection Metadata Store delete() expectedRevision must be a positive safe integer.',
      );
    }
    await this.initialize();
    const knex = await this.options.resolveClient();
    const deleted = await this.table(knex)
      .where({ name, revision: options.expectedRevision })
      .delete();
    if (Number(deleted) !== 1) {
      throw new CollectionMetadataConflictError(
        name,
        options.expectedRevision,
        await this.actualRevision(knex, name),
      );
    }
  }

  private async createTable(): Promise<void> {
    validateCollectionMetadataStoreName(this.tableName);
    if (this.options.schema !== undefined) {
      validateCollectionMetadataStoreName(this.options.schema);
    }
    const knex = await this.options.resolveClient();
    const schema = this.schema(knex);
    const tableName = this.tableName;
    if (await schema.hasTable(tableName)) return;
    try {
      await schema.createTable(tableName, (table) => {
        table.string('name', 191).primary();
        table.text('document').notNullable();
        table.bigInteger('revision').notNullable();
        table.dateTime('created_at').notNullable();
        table.dateTime('updated_at').notNullable();
      });
    } catch (error) {
      if (!(await schema.hasTable(tableName))) throw error;
    }
  }

  private table(knex: Knex): Knex.QueryBuilder {
    const tableName = this.tableName;
    return this.options.schema
      ? knex.withSchema(this.options.schema).table(tableName)
      : knex(tableName);
  }

  private schema(knex: Knex): Knex.SchemaBuilder {
    return this.options.schema
      ? knex.schema.withSchema(this.options.schema)
      : knex.schema;
  }

  private async actualRevision(
    knex: Knex,
    name: string,
  ): Promise<number | null> {
    const row = (await this.table(knex)
      .select('revision')
      .where({ name })
      .first()) as Pick<CollectionMetadataRow, 'revision'> | undefined;
    return row ? parseDatabaseRevision(name, row.revision) : null;
  }

  private fromRow(row: CollectionMetadataRow): StoredCollectionMetadata {
    const parsed =
      typeof row.document === 'string'
        ? (JSON.parse(row.document) as unknown)
        : row.document;
    const document = validateCollectionMetadataDocument(parsed);
    if (document.name !== row.name) {
      throw new Error(
        `Collection Metadata row name "${row.name}" does not match document name "${document.name}".`,
      );
    }
    const revision = parseDatabaseRevision(row.name, row.revision);
    return { document, revision };
  }
}

function validDatabaseRevision(revision: unknown): revision is number {
  return (
    typeof revision === 'number' &&
    Number.isSafeInteger(revision) &&
    revision > 0
  );
}

function validDatabaseUpdateRevision(revision: unknown): revision is number {
  return validDatabaseRevision(revision) && revision < Number.MAX_SAFE_INTEGER;
}

function parseDatabaseRevision(name: string, input: string | number): number {
  const revision = Number(input);
  if (!validDatabaseRevision(revision)) {
    throw new Error(
      `Collection Metadata row "${name}" has invalid revision "${String(input)}".`,
    );
  }
  return revision;
}
