import type { CollectionBuilder } from '../collection/builder/index.js';
import type { QueryAdapter } from '../query/index.js';
import type {
  DatabaseCapabilities,
  SchemaAdapter,
  SchemaInspector,
} from '../schema/index.js';
import type {
  DatabaseDialect,
  DatabaseDriver,
  SchemaManagementMode,
} from './config.js';

export interface DatabaseConnection {
  name: string;
  driver: DatabaseDriver;
  dialect: DatabaseDialect;
  schemaManagement: SchemaManagementMode;
  capabilities: DatabaseCapabilities;

  /** Collection schema and metadata builder. Uses Collection and Field logical names. */
  builder: CollectionBuilder;
  /** Database-layer query builder. Uses Connection naming but not Collection-level overrides. */
  query: QueryAdapter;
  schema: SchemaAdapter;
  /** Read-only physical database schema introspection. Uses physical names. */
  schemaInspector: SchemaInspector;

  /** Escape hatch for the underlying adapter client. Prefer builder/query for portable code. */
  client<T = unknown>(): Promise<T>;

  connect(): Promise<this>;
  disconnect(): Promise<void>;
  reconnect(): Promise<this>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T>;
}
