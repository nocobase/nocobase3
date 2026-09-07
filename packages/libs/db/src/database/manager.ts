import type { CollectionBuilder } from '../collection/builder/builder.js';
import { createMigrator, type Migrator } from '../migration/migrator.js';
import type { DatabaseMigratorOptions } from '../migration/types.js';
import type { QueryAdapter } from '../query/types.js';
import type { Repository, RepositoryRecord } from '../repository/types.js';
import { createSeeder, type Seeder } from '../seed/seeder.js';
import type { DatabaseSeederOptions } from '../seed/types.js';
import type { DatabaseConfig } from './config.js';
import type { DatabaseConnection } from './connection.js';
import { DefaultConnectionFactory, type ConnectionFactory } from './factory.js';
import { KnexConnectionAdapter } from './internal/knex/adapter.js';

export interface DatabaseManager {
  connection(name?: string): DatabaseConnection;
  /** Collection schema and metadata builder. Uses Collection and Field logical names. */
  builder(name?: string): CollectionBuilder;
  /** Database-layer query builder. Does not read Collection metadata or collection table prefixes. */
  query(name?: string): QueryAdapter;
  repository<
    TRecord extends object = RepositoryRecord,
    TCreate extends object = Partial<TRecord>,
    TUpdate extends object = Partial<TRecord>,
  >(
    collection: string,
    connection?: string,
  ): Repository<TRecord, TCreate, TUpdate>;
  createMigrator(options: DatabaseMigratorOptions): Migrator;
  createSeeder(options: DatabaseSeederOptions): Seeder;

  connect(name?: string): Promise<DatabaseConnection>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    name?: string,
  ): Promise<T>;

  disconnect(name?: string): Promise<void>;
  reconnect(name?: string): Promise<DatabaseConnection>;
  destroy(): Promise<void>;
}

export class CollectionMetadataStoreRequiredError extends Error {
  readonly code = 'COLLECTION_METADATA_STORE_REQUIRED' as const;

  constructor(readonly connection: string) {
    super(
      `External database connection "${connection}" requires an explicit Collection Metadata Store.`,
    );
    this.name = 'CollectionMetadataStoreRequiredError';
  }
}

export function createDatabaseManager(config: DatabaseConfig): DatabaseManager {
  return new DefaultDatabaseManager(
    config,
    new DefaultConnectionFactory({
      knex: new KnexConnectionAdapter(),
    }),
  );
}

export class DefaultDatabaseManager implements DatabaseManager {
  private readonly connections = new Map<string, DatabaseConnection>();

  constructor(
    private readonly config: DatabaseConfig,
    private readonly factory: ConnectionFactory,
  ) {}

  connection(
    name: string = this.getDefaultConnectionName(),
  ): DatabaseConnection {
    const existing = this.connections.get(name);
    if (existing) {
      return existing;
    }

    const connectionConfig = this.config.connections[name];
    if (!connectionConfig) {
      throw new Error(`Database connection "${name}" is not configured.`);
    }

    const metadataStore =
      connectionConfig.metadataStore ?? this.config.metadataStore;
    if (connectionConfig.schemaManagement === 'external' && !metadataStore) {
      throw new CollectionMetadataStoreRequiredError(name);
    }
    const connection = this.factory.create({
      name,
      config: connectionConfig,
      metadataStore,
    });
    this.connections.set(name, connection);
    return connection;
  }

  builder(name?: string): CollectionBuilder {
    return this.connection(name).builder;
  }

  query(name?: string): QueryAdapter {
    return this.connection(name).query;
  }

  repository<
    TRecord extends object = RepositoryRecord,
    TCreate extends object = Partial<TRecord>,
    TUpdate extends object = Partial<TRecord>,
  >(
    collection: string,
    connection?: string,
  ): Repository<TRecord, TCreate, TUpdate> {
    return this.connection(connection).repository<TRecord, TCreate, TUpdate>(
      collection,
    );
  }

  createMigrator(options: DatabaseMigratorOptions): Migrator {
    return createMigrator({ ...options, database: this });
  }

  createSeeder(options: DatabaseSeederOptions): Seeder {
    return createSeeder({ ...options, database: this });
  }

  async connect(name?: string): Promise<DatabaseConnection> {
    return this.connection(name).connect();
  }

  async transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    name?: string,
  ): Promise<T> {
    return this.connection(name).transaction(fn);
  }

  async disconnect(
    name: string = this.getDefaultConnectionName(),
  ): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) {
      return;
    }
    await connection.disconnect();
  }

  async reconnect(
    name: string = this.getDefaultConnectionName(),
  ): Promise<DatabaseConnection> {
    const connection = this.connection(name);
    return connection.reconnect();
  }

  async destroy(): Promise<void> {
    await Promise.all(
      [...this.connections.values()].map((connection) =>
        connection.disconnect(),
      ),
    );
    this.connections.clear();
  }

  private getDefaultConnectionName(): string {
    const name = this.config.default ?? Object.keys(this.config.connections)[0];
    if (!name) {
      throw new Error('No database connections configured.');
    }
    return name;
  }
}
