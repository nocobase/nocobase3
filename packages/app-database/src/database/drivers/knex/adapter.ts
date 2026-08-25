import type { DatabaseConnection } from '../../connection.js';
import type {
  ConnectionAdapter,
  ConnectionAdapterContext,
} from '../../factory.js';
import { KnexDatabaseConnection } from './connection.js';
import type { ConnectionConfig } from '../../config.js';

export class KnexConnectionAdapter implements ConnectionAdapter<ConnectionConfig> {
  createConnection(
    context: ConnectionAdapterContext<ConnectionConfig>,
  ): DatabaseConnection {
    return new KnexDatabaseConnection(
      context.name,
      context.config,
      context.metadataStore,
    );
  }
}
