import type { CollectionMetadataStore } from '../metadata/index.js';
import type { BaseConnectionConfig } from './config.js';
import type { DatabaseConnection } from './connection.js';

export interface ConnectionDriver<TConfig extends BaseConnectionConfig = BaseConnectionConfig> {
  createConnection(context: ConnectionDriverContext<TConfig>): DatabaseConnection;
}

export interface ConnectionDriverContext<TConfig extends BaseConnectionConfig = BaseConnectionConfig> {
  name: string;
  config: TConfig;
  metadataStore: CollectionMetadataStore;
}

export interface ConnectionFactory {
  create(context: ConnectionDriverContext): DatabaseConnection;
}

export class DefaultConnectionFactory implements ConnectionFactory {
  constructor(private readonly drivers: Record<string, ConnectionDriver<any>>) {}

  create(context: ConnectionDriverContext): DatabaseConnection {
    const driver = this.drivers[context.config.driver];
    if (!driver) {
      throw new Error(`Database driver "${context.config.driver}" is not registered.`);
    }
    return driver.createConnection(context as never);
  }
}
