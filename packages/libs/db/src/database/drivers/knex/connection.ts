import type { Knex } from 'knex';
import { CollectionBuilder } from '../../../collection/builder/index.js';
import {
  CollectionRegistry,
  RegistryMetadataDocumentValidator,
  type ConnectionCollections,
} from '../../../collection/registry/index.js';
import {
  CollectionMetadataService,
  LegacyCollectionMetadataDocumentStore,
  type CollectionMetadataDocumentStore,
  type CollectionMetadataStore,
} from '../../../metadata/index.js';
import { DefaultNamingStrategy } from '../../../naming/index.js';
import { KnexQueryAdapter, type QueryAdapter } from '../../../query/index.js';
import { KnexSchemaAdapter } from '../../../schema/adapters/knex/index.js';
import type {
  DatabaseCapabilities,
  SchemaAdapter,
} from '../../../schema/index.js';
import type { SchemaInspector } from '../../../schema/inspector/index.js';
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

  constructor(
    readonly name: string,
    private readonly sourceConfig: ConnectionConfig,
    private readonly metadataStore: CollectionMetadataStore,
    private readonly collectionMetadataStore: CollectionMetadataDocumentStore,
    knexInstance?: Knex,
  ) {
    this.knexInstance = knexInstance;
    this.config = resolveKnexConnectionConfig(sourceConfig);
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
      metadataStore: collectionMetadataStore,
      naming: this.config.naming,
    });
    this.collections = collections;
    this.collectionMetadata = new CollectionMetadataService({
      store: collectionMetadataStore,
      validator: new RegistryMetadataDocumentValidator({
        inspector: this.schemaInspector,
        metadataStore: collectionMetadataStore,
        collections,
        naming: this.config.naming,
      }),
      invalidator: collections,
      onInvalidationError: (error) =>
        this.reportCollectionMetadataInvalidationError(error),
    });
    this.builder = new CollectionBuilder({
      schemaAdapter: this.schema,
      metadataStore,
      collections,
      collectionMetadata:
        collectionMetadataStore instanceof LegacyCollectionMetadataDocumentStore
          ? undefined
          : this.collectionMetadata,
      schemaInvalidator: collections,
      naming: this.config.naming,
    });
  }

  async connect(): Promise<this> {
    this.getClient();
    await (this.collections as CollectionRegistry).initialize();
    await this.builder.validateMetadataCompatibility();
    return this;
  }

  async client<T = unknown>(): Promise<T> {
    return this.resolveClient() as T;
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
    return client.transaction(async (trx) => {
      const connection = new KnexDatabaseConnection(
        this.name,
        this.sourceConfig,
        this.metadataStore,
        this.collectionMetadataStore,
        trx,
      );
      return fn(connection);
    });
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
