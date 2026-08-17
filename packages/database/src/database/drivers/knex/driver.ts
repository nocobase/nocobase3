import type { DatabaseConnection } from '../../connection.js';
import type { ConnectionDriver, ConnectionDriverContext } from '../../factory.js';
import { KnexDatabaseConnection } from './connection.js';
import type { KnexConnectionConfig } from './config.js';

export class KnexConnectionDriver implements ConnectionDriver<KnexConnectionConfig> {
  createConnection(context: ConnectionDriverContext<KnexConnectionConfig>): DatabaseConnection {
    return new KnexDatabaseConnection(context.name, context.config, context.metadataStore);
  }
}
