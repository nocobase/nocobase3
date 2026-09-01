import type { CollectionBuilder } from '../collection/builder/index.js';
import {
  InMemoryCollectionMetadataStore,
  LegacyCollectionMetadataDocumentStore,
} from '../metadata/index.js';
import type { QueryAdapter } from '../query/index.js';
import type { DatabaseConfig } from './config.js';
import type { DatabaseConnection } from './connection.js';
import { DefaultConnectionFactory, type ConnectionFactory } from './factory.js';
import { KnexConnectionAdapter } from './drivers/knex/index.js';

export interface DatabaseManager {
  connection(name?: string): DatabaseConnection;
  /** Collection schema and metadata builder. Uses Collection and Field logical names. */
  builder(name?: string): CollectionBuilder;
  /** Database-layer query builder. Does not read Collection metadata or collection table prefixes. */
  query(name?: string): QueryAdapter;

  connect(name?: string): Promise<DatabaseConnection>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    name?: string,
  ): Promise<T>;

  disconnect(name?: string): Promise<void>;
  reconnect(name?: string): Promise<DatabaseConnection>;
  destroy(): Promise<void>;
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
      connectionConfig.metadataStore ??
      this.config.metadataStore ??
      new InMemoryCollectionMetadataStore();
    const connection = this.factory.create({
      name,
      config: connectionConfig,
      metadataStore,
      collectionMetadataStore:
        connectionConfig.collectionMetadataStore ??
        this.config.collectionMetadataStore ??
        new LegacyCollectionMetadataDocumentStore(metadataStore, {
          naming: connectionConfig.naming,
        }),
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
