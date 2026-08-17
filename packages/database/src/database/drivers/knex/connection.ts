import type { Knex } from 'knex';
import { CollectionBuilder } from '../../../collection/builder/index.js';
import type { CollectionMetadataStore } from '../../../metadata/index.js';
import { DefaultNamingStrategy } from '../../../naming/index.js';
import { KnexQueryAdapter, type QueryAdapter } from '../../../query/index.js';
import { KnexSchemaAdapter } from '../../../schema/adapters/knex/index.js';
import type { DatabaseCapabilities, SchemaAdapter } from '../../../schema/index.js';
import { resolveDatabaseCapabilities } from '../../capabilities.js';
import type { DatabaseConnection } from '../../connection.js';
import { createKnexClient, normalizeKnexDialect } from './client.js';
import type { KnexConnectionConfig } from './config.js';

export class KnexDatabaseConnection implements DatabaseConnection {
  readonly driver = 'knex';
  readonly dialect: string;
  readonly capabilities: DatabaseCapabilities;
  readonly schema: SchemaAdapter;
  readonly builder: CollectionBuilder;
  readonly query: QueryAdapter;

  private knexInstance?: Knex;

  constructor(
    readonly name: string,
    private readonly config: KnexConnectionConfig,
    private readonly metadataStore: CollectionMetadataStore,
    knexInstance?: Knex,
  ) {
    this.knexInstance = knexInstance;
    this.dialect = normalizeKnexDialect(config.client);
    this.capabilities = resolveDatabaseCapabilities(this.dialect, config.capabilities);
    this.schema = new LazySchemaAdapter(
      () => this.resolveClient(),
      (client) => new KnexSchemaAdapter(client, {
        dialect: this.dialect,
        capabilities: this.capabilities,
      }),
      this.dialect,
      this.capabilities,
    );
    this.query = new KnexQueryAdapter(
      () => this.getClient(),
      new DefaultNamingStrategy({
        underscored: config.naming?.underscored,
        tablePrefix: '',
      }),
    );
    this.builder = new CollectionBuilder({
      schemaAdapter: this.schema,
      metadataStore,
      naming: config.naming,
      namingStrategy: config.namingStrategy,
    });
  }

  async connect(): Promise<this> {
    this.getClient();
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

  async transaction<T>(fn: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    const client = await this.resolveClient();
    return client.transaction(async (trx) => {
      const connection = new KnexDatabaseConnection(this.name, this.config, this.metadataStore, trx);
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

  async execute(operations: Parameters<SchemaAdapter['execute']>[0]): Promise<void> {
    return (await this.resolveAdapter()).execute(operations);
  }

  async compile(operations: Parameters<NonNullable<SchemaAdapter['compile']>>[0]): Promise<string[]> {
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
