import type { Knex } from 'knex';
import { CollectionBuilder } from '../../../collection/builder/builder.js';
import { CollectionRegistry } from '../../../collection/registry/registry.js';
import { RegistryMetadataDocumentValidator } from '../../../collection/registry/metadata-validator.js';
import type { ConnectionCollections } from '../../../collection/registry/types.js';
import { CollectionMetadataService } from '../../../metadata/service.js';
import { DatabaseCollectionMetadataStore } from '../../../metadata/internal/database-document-store.js';
import { TransactionCollectionMetadataStore } from '../../../metadata/internal/transaction-document-store.js';
import type { CollectionMetadataStore } from '../../../metadata/document-store.js';
import type {
  CollectionMetadataInvalidation,
  CollectionMetadataInvalidator,
} from '../../../metadata/service.js';
import { DefaultNamingStrategy } from '../../../naming/default-strategy.js';
import { KnexQueryAdapter } from '../../../query/internal/knex/adapter.js';
import type { QueryAdapter } from '../../../query/types.js';
import { KnexRepositoryExecutionAdapter } from '../../../repository/internal/knex-execution-adapter.js';
import { DefaultRepository } from '../../../repository/repository.js';
import type {
  Repository,
  RepositoryRecord,
} from '../../../repository/types.js';
import { KnexSchemaAdapter } from '../../../schema/internal/knex/adapter.js';
import type {
  DatabaseCapabilities,
  SchemaAdapter,
} from '../../../schema/adapter.js';
import type { SchemaInspector } from '../../../schema/inspector/types.js';
import { resolveDatabaseCapabilities } from '../../capabilities.js';
import type {
  ConnectionConfig,
  DatabaseDialect,
  DatabaseDriver,
  SchemaManagementMode,
} from '../../config.js';
import type { DatabaseConnection } from '../../connection.js';
import { SchemaManagementSchemaAdapter } from '../../schema-management.js';
import { createKnexClient } from './client.js';
import {
  resolveKnexConnectionConfig,
  type KnexConnectionConfig,
} from './config.js';
import { resolveKnexDatabaseDialectAdapter } from './dialect-adapters.js';

export class KnexDatabaseConnection implements DatabaseConnection {
  readonly driver: DatabaseDriver;
  readonly dialect: DatabaseDialect;
  readonly schemaManagement: SchemaManagementMode;
  readonly capabilities: DatabaseCapabilities;
  readonly schema: SchemaAdapter;
  readonly schemaInspector: SchemaInspector;
  readonly builder: CollectionBuilder;
  readonly collections: ConnectionCollections;
  readonly collectionMetadata: CollectionMetadataService;
  readonly query: QueryAdapter;

  private knexInstance?: Knex;
  private readonly config: KnexConnectionConfig;
  private readonly metadataStore: CollectionMetadataStore;

  constructor(
    readonly name: string,
    private readonly sourceConfig: ConnectionConfig,
    metadataStore?: CollectionMetadataStore,
    knexInstance?: Knex,
    transactionInvalidations?: TransactionInvalidationCollector,
  ) {
    this.knexInstance = knexInstance;
    this.config = resolveKnexConnectionConfig(sourceConfig);
    this.metadataStore =
      metadataStore ??
      new DatabaseCollectionMetadataStore({
        resolveClient: () => this.resolveClient(),
      });
    this.driver = this.config.driver;
    this.dialect = this.config.dialect;
    this.schemaManagement = this.config.schemaManagement;
    this.capabilities = resolveDatabaseCapabilities(
      this.dialect,
      this.config.capabilities,
    );
    this.schemaInspector = resolveKnexDatabaseDialectAdapter(
      this.dialect,
    ).createSchemaInspector({
      connectionName: this.name,
      config: this.config,
      resolveClient: () => this.resolveClient(),
    });
    this.schema = new SchemaManagementSchemaAdapter(
      new LazySchemaAdapter(
        () => this.resolveClient(),
        (client) =>
          new KnexSchemaAdapter(client, {
            dialect: this.dialect,
            capabilities: this.capabilities,
          }),
        this.dialect,
        this.capabilities,
      ),
      {
        connectionName: this.name,
        mode: this.schemaManagement,
      },
    );
    this.query = new KnexQueryAdapter(
      () => this.getClient(),
      new DefaultNamingStrategy({
        underscored: this.config.naming?.underscored,
        tablePrefix: this.config.naming?.tablePrefix,
      }),
    );
    const collections = new CollectionRegistry({
      inspector: this.schemaInspector,
      metadataStore: this.metadataStore,
      naming: this.config.naming,
      isInternalPhysicalCollection:
        this.metadataStore instanceof DatabaseCollectionMetadataStore
          ? (identity) =>
              this.metadataStore instanceof DatabaseCollectionMetadataStore &&
              this.metadataStore.isInternalPhysicalCollection(identity)
          : undefined,
    });
    this.collections = collections;
    const invalidator = transactionInvalidations
      ? new TransactionCollectionInvalidator(
          collections,
          transactionInvalidations,
        )
      : collections;
    this.collectionMetadata = new CollectionMetadataService({
      store: this.metadataStore,
      validator: new RegistryMetadataDocumentValidator({
        inspector: this.schemaInspector,
        metadataStore: this.metadataStore,
        collections,
        naming: this.config.naming,
        deferRelationValidation: Boolean(transactionInvalidations),
      }),
      invalidator,
      onInvalidationError: (error) =>
        this.reportCollectionMetadataInvalidationError(error),
    });
    this.builder = new CollectionBuilder({
      schemaAdapter: this.schema,
      collections,
      collectionMetadata: this.collectionMetadata,
      schemaInvalidator: invalidator,
      naming: this.config.naming,
    });
  }

  async connect(): Promise<this> {
    this.getClient();
    await (this.collections as CollectionRegistry).initialize();
    return this;
  }

  async client<T = unknown>(): Promise<T> {
    return this.resolveClient() as T;
  }

  repository<
    TRecord extends object = RepositoryRecord,
    TCreate extends object = Partial<TRecord>,
    TUpdate extends object = Partial<TRecord>,
  >(collection: string): Repository<TRecord, TCreate, TUpdate> {
    return new DefaultRepository<TRecord, TCreate, TUpdate>({
      collection,
      collections: this.collections,
      adapter: new KnexRepositoryExecutionAdapter(
        () => this.getClient(),
        (name) => this.collections.get(name),
      ),
    });
  }

  async disconnect(): Promise<void> {
    this.collections.invalidate();
    const client = this.knexInstance;
    if (!client) {
      return;
    }
    this.knexInstance = undefined;
    await client.destroy();
  }

  async reconnect(): Promise<this> {
    await this.disconnect();
    await this.connect();
    return this;
  }

  async transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T> {
    const client = await this.resolveClient();
    let stagedMetadata: TransactionCollectionMetadataStore | undefined;
    const invalidations = new TransactionInvalidationCollector();
    let result: T;
    try {
      result = await client.transaction(async (trx) => {
        const metadataStore =
          this.metadataStore instanceof DatabaseCollectionMetadataStore
            ? this.metadataStore.withClient(async () => trx)
            : (stagedMetadata = new TransactionCollectionMetadataStore(
                this.metadataStore,
              ));
        const connection = new KnexDatabaseConnection(
          this.name,
          this.sourceConfig,
          metadataStore,
          trx,
          invalidations,
        );
        const transactionResult = await fn(connection);
        await invalidations.validateRelations(connection.collections);
        await stagedMetadata?.commit();
        return transactionResult;
      });
    } catch (error) {
      await stagedMetadata?.rollbackCommitted();
      invalidations.clear();
      throw error;
    }
    invalidations.apply(this.collections as CollectionRegistry);
    return result;
  }

  private getClient(): Knex {
    if (!this.knexInstance) {
      this.knexInstance = createKnexClient(this.config);
    }
    return this.knexInstance;
  }

  private async resolveClient(): Promise<Knex> {
    return this.getClient();
  }

  private reportCollectionMetadataInvalidationError(error: unknown): void {
    if (this.sourceConfig.onCollectionMetadataInvalidationError) {
      this.sourceConfig.onCollectionMetadataInvalidationError(error);
      return;
    }
    process.emitWarning(
      error instanceof Error ? error : new Error(String(error)),
      { code: 'COLLECTION_METADATA_INVALIDATION_FAILED' },
    );
  }
}

class TransactionInvalidationCollector {
  private all = false;
  private namingIndex = false;
  private readonly collections = new Set<string>();

  async validateRelations(collections: ConnectionCollections): Promise<void> {
    for (const collection of this.collections) {
      await collections.validateRelations(collection);
    }
  }

  record(change?: CollectionMetadataInvalidation): void {
    if (!change) {
      this.all = true;
      return;
    }
    for (const collection of change.collections) {
      this.collections.add(collection);
    }
    this.namingIndex ||= change.namingIndex;
  }

  apply(target: CollectionMetadataInvalidator): void {
    if (this.all) {
      target.invalidateAll();
    } else if (this.collections.size > 0 || this.namingIndex) {
      target.invalidate({
        collections: [...this.collections],
        namingIndex: this.namingIndex,
      });
    }
    this.clear();
  }

  clear(): void {
    this.all = false;
    this.namingIndex = false;
    this.collections.clear();
  }
}

class TransactionCollectionInvalidator implements CollectionMetadataInvalidator {
  constructor(
    private readonly local: CollectionMetadataInvalidator,
    private readonly transaction: TransactionInvalidationCollector,
  ) {}

  invalidate(change: CollectionMetadataInvalidation): void {
    this.local.invalidate(change);
    this.transaction.record(change);
  }

  invalidateAll(): void {
    this.local.invalidateAll();
    this.transaction.record();
  }
}

class LazySchemaAdapter implements SchemaAdapter {
  private adapter?: SchemaAdapter;

  constructor(
    private readonly resolveClient: () => Promise<Knex>,
    private readonly createAdapter: (client: Knex) => SchemaAdapter,
    readonly dialect: string,
    readonly capabilities: DatabaseCapabilities,
  ) {}

  async execute(
    operations: Parameters<SchemaAdapter['execute']>[0],
  ): Promise<void> {
    return (await this.resolveAdapter()).execute(operations);
  }

  async compile(
    operations: Parameters<NonNullable<SchemaAdapter['compile']>>[0],
  ): Promise<string[]> {
    const adapter = await this.resolveAdapter();
    return adapter.compile ? adapter.compile(operations) : [];
  }

  private async resolveAdapter(): Promise<SchemaAdapter> {
    if (!this.adapter) {
      this.adapter = this.createAdapter(await this.resolveClient());
    }
    return this.adapter;
  }
}
