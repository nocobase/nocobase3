import type { CollectionMetadataStore } from '../metadata/index.js';
import type { ConnectionConfig } from './config.js';
import type { DatabaseConnection } from './connection.js';

export interface ConnectionAdapter<
  TConfig extends ConnectionConfig = ConnectionConfig,
> {
  createConnection(
    context: ConnectionAdapterContext<TConfig>,
  ): DatabaseConnection;
}

export interface ConnectionAdapterContext<
  TConfig extends ConnectionConfig = ConnectionConfig,
> {
  name: string;
  config: TConfig;
  metadataStore: CollectionMetadataStore;
}

export interface ConnectionFactory {
  create(context: ConnectionAdapterContext): DatabaseConnection;
}

export class DefaultConnectionFactory implements ConnectionFactory {
  constructor(
    private readonly adapters: Record<string, ConnectionAdapter<any>>,
    private readonly defaultAdapter = 'knex',
  ) {}

  create(context: ConnectionAdapterContext): DatabaseConnection {
    const adapter = this.adapters[this.defaultAdapter];
    if (!adapter) {
      throw new Error(
        `Database adapter "${this.defaultAdapter}" is not registered.`,
      );
    }
    return adapter.createConnection(context as never);
  }
}
