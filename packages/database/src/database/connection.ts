import type { CollectionBuilder } from '../collection/builder/index.js';
import type { QueryAdapter } from '../query/index.js';
import type { DatabaseCapabilities, SchemaAdapter } from '../schema/index.js';

export interface DatabaseConnection {
  name: string;
  driver: string;
  dialect: string;
  capabilities: DatabaseCapabilities;

  builder: CollectionBuilder;
  query: QueryAdapter;
  schema: SchemaAdapter;

  client<T = unknown>(): Promise<T>;

  connect(): Promise<this>;
  disconnect(): Promise<void>;
  reconnect(): Promise<this>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T>;
}
