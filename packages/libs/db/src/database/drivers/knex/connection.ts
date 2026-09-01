import type { Knex } from 'knex';
import { CollectionBuilder } from '../../../collection/builder/index.js';
import type { CollectionMetadataStore } from '../../../metadata/index.js';
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
  readonly query: QueryAdapter;

  private knexInstance?: Knex;
  private readonly config: KnexConnectionConfig;

  constructor(
    readonly name: string,
    private readonly sourceConfig: ConnectionConfig,
    private readonly metadataStore: CollectionMetadataStore,
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
    this.builder = new CollectionBuilder({
      schemaAdapter: this.schema,
      metadataStore,
      naming: this.config.naming,
    });
  }

  async connect(): Promise<this> {
    this.getClient();
    await this.builder.validateMetadataCompatibility();
    return this;
  }

  async client<T = unknown>(): Promise<T> {
    return this.resolveClient() as T;
  }

  async disconnect(): Promise<void> {
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
