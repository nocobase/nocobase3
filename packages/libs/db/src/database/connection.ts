import type { CollectionBuilder } from '../collection/builder/builder.js';
import type { ConnectionCollections } from '../collection/registry/types.js';
import type { CollectionMetadataService } from '../metadata/service.js';
import type { QueryAdapter } from '../query/types.js';
import type { Repository, RepositoryRecord } from '../repository/types.js';
import type {
  NormalizedRepositoryPolicy,
  RepositoryPolicy,
} from '../repository/policy/types.js';
import type { DatabaseCapabilities, SchemaAdapter } from '../schema/adapter.js';
import type { SchemaInspector } from '../schema/inspector/types.js';
import type { DatabaseDriver, SchemaManagementMode } from './config.js';
import type { DatabaseDriverRuntime } from './runtime.js';

export interface DatabaseConnection {
  name: string;
  driver: DatabaseDriver;
  /** Dialect identifier supplied by the registered driver package. */
  dialect: string;
  schemaManagement: SchemaManagementMode;
  capabilities: DatabaseCapabilities;
  /** Runtime strategies supplied by the registered dialect package. */
  runtime: DatabaseDriverRuntime;

  /** Collection schema and metadata builder. Uses Collection and Field logical names. */
  builder: CollectionBuilder;
  /** Resolved physical Schema plus supplemental Collection metadata. */
  collections: ConnectionCollections;
  /** Supplemental Collection metadata read and update service. */
  collectionMetadata: CollectionMetadataService;
  /** Database-layer query builder. Uses Connection naming but not Collection-level overrides. */
  query: QueryAdapter;
  repository<
    TRecord extends object = RepositoryRecord,
    TCreate extends object = Partial<TRecord>,
    TUpdate extends object = Partial<TRecord>,
  >(
    collection: string,
  ): Repository<TRecord, TCreate, TUpdate>;
  /**
   * Bind a Policy per Collection for one principal.
   *
   * Binding lives here rather than on each Repository because a request
   * usually touches several Collections and takes fresh Repositories inside a
   * transaction; one place to bind is also one place to see what this request
   * was authorized to touch.
   */
  withPolicies<P>(
    policies: Readonly<
      Record<string, RepositoryPolicy | ((principal: P) => RepositoryPolicy)>
    >,
    principal: P,
  ): ScopedDatabaseConnection;
  schema: SchemaAdapter;
  /** Read-only physical database schema introspection. Uses physical names. */
  schemaInspector: SchemaInspector;

  /** Escape hatch for the underlying adapter client. Prefer builder/query for portable code. */
  client<T = unknown>(): Promise<T>;

  connect(): Promise<this>;
  disconnect(): Promise<void>;
  reconnect(): Promise<this>;
  /** Destructively clears the objects owned by this managed connection. */
  resetManagedSchema(): Promise<void>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
  ): Promise<T>;
}

/**
 * A Connection carrying Policy bindings. It has no `withPolicies` of its own,
 * so the bindings cannot be replaced by a second call — narrowing them is
 * `narrow` on the Repository, and widening is not on offer.
 */
export interface ScopedDatabaseConnection extends Omit<
  DatabaseConnection,
  'withPolicies' | 'transaction' | 'connect' | 'reconnect'
> {
  /** The Policies in force, by Collection name. */
  explainPolicies(): Readonly<Record<string, NormalizedRepositoryPolicy>>;
  connect(): Promise<ScopedDatabaseConnection>;
  reconnect(): Promise<ScopedDatabaseConnection>;
  transaction<T>(
    fn: (connection: ScopedDatabaseConnection) => Promise<T>,
  ): Promise<T>;
}
