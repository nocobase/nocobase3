import knex, { type Knex } from 'knex';
import { KnexSchemaAdapter } from './adapters/knex.js';
import type { DatabaseCapabilities, SchemaAdapter } from './adapter.js';
import { CollectionBuilder } from './builder.js';
import { InMemoryCollectionMetadataStore, type CollectionMetadataStore } from './metadata.js';
import { DefaultNamingStrategy, type NamingStrategy } from './naming.js';
import type { NamingOptions } from './types.js';

export interface QueryAdapter {
  table(name: string): any;
  raw<T = unknown>(sql: string, bindings?: unknown[]): Promise<T>;
}

export interface DatabaseManager {
  connection(name?: string): DatabaseConnection;
  builder(name?: string): CollectionBuilder;
  query(name?: string): QueryAdapter;

  connect(name?: string): Promise<DatabaseConnection>;
  client<T = unknown>(name?: string): Promise<T>;

  transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    name?: string,
  ): Promise<T>;

  disconnect(name?: string): Promise<void>;
  reconnect(name?: string): Promise<DatabaseConnection>;
  destroy(): Promise<void>;
}

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

export interface DatabaseConfig {
  default?: string;
  connections: Record<string, ConnectionConfig>;
  metadataStore?: CollectionMetadataStore;
}

export type ConnectionConfig = KnexConnectionConfig;

export interface BaseConnectionConfig {
  driver: string;
  schema?: string;
  naming?: NamingOptions;
  namingStrategy?: NamingStrategy;
  capabilities?: Partial<DatabaseCapabilities>;
  metadataStore?: CollectionMetadataStore;
  managed?: boolean;
  debug?: boolean;
}

export interface KnexConnectionConfig extends BaseConnectionConfig {
  driver: 'knex';
  client: string;
  connection?: unknown;
  pool?: unknown;
  useNullAsDefault?: boolean;
  searchPath?: string[];
}

export interface ConnectionDriver<TConfig extends BaseConnectionConfig = BaseConnectionConfig> {
  createConnection(context: ConnectionDriverContext<TConfig>): DatabaseConnection;
}

export interface ConnectionDriverContext<TConfig extends BaseConnectionConfig = BaseConnectionConfig> {
  name: string;
  config: TConfig;
  metadataStore: CollectionMetadataStore;
}

export function defineDatabase<T extends DatabaseConfig>(config: T): T {
  return config;
}

export function createDatabaseManager(config: DatabaseConfig): DatabaseManager {
  return new DefaultDatabaseManager(config, new DefaultConnectionFactory({
    knex: new KnexConnectionDriver(),
  }));
}

export class DefaultDatabaseManager implements DatabaseManager {
  private readonly connections = new Map<string, DatabaseConnection>();

  constructor(
    private readonly config: DatabaseConfig,
    private readonly factory: ConnectionFactory,
  ) {}

  connection(name = this.getDefaultConnectionName()): DatabaseConnection {
    const existing = this.connections.get(name);
    if (existing) {
      return existing;
    }

    const connectionConfig = this.config.connections[name];
    if (!connectionConfig) {
      throw new Error(`Database connection "${name}" is not configured.`);
    }

    const connection = this.factory.create({
      name,
      config: connectionConfig,
      metadataStore: connectionConfig.metadataStore ?? this.config.metadataStore ?? new InMemoryCollectionMetadataStore(),
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

  async client<T = unknown>(name?: string): Promise<T> {
    return this.connection(name).client<T>();
  }

  async transaction<T>(
    fn: (connection: DatabaseConnection) => Promise<T>,
    name?: string,
  ): Promise<T> {
    return this.connection(name).transaction(fn);
  }

  async disconnect(name = this.getDefaultConnectionName()): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) {
      return;
    }
    await connection.disconnect();
  }

  async reconnect(name = this.getDefaultConnectionName()): Promise<DatabaseConnection> {
    const connection = this.connection(name);
    return connection.reconnect();
  }

  async destroy(): Promise<void> {
    await Promise.all([...this.connections.values()].map((connection) => connection.disconnect()));
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

export class KnexConnectionDriver implements ConnectionDriver<KnexConnectionConfig> {
  createConnection(context: ConnectionDriverContext<KnexConnectionConfig>): DatabaseConnection {
    return new KnexDatabaseConnection(context.name, context.config, context.metadataStore);
  }
}

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
      () => this.resolveClient(),
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
    await this.resolveClient();
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

  private async resolveClient(): Promise<Knex> {
    if (!this.knexInstance) {
      this.knexInstance = knex({
        client: this.config.client,
        connection: this.config.connection as Knex.StaticConnectionConfig,
        pool: this.config.pool as Knex.PoolConfig,
        useNullAsDefault: this.config.useNullAsDefault,
        searchPath: this.config.searchPath,
        debug: this.config.debug,
      });
    }
    return this.knexInstance;
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

export class KnexQueryAdapter implements QueryAdapter {
  private readonly naming: NamingStrategy;

  constructor(
    private readonly resolveClient: () => Promise<Knex>,
    naming: NamingStrategy = new DefaultNamingStrategy({ tablePrefix: '' }),
  ) {
    this.naming = naming;
  }

  table(name: string): any {
    return new LazyKnexTableQuery(this.resolveClient, this.naming, name);
  }

  async raw<T = unknown>(sql: string, bindings: unknown[] = []): Promise<T> {
    const client = await this.resolveClient();
    return client.raw(sql, bindings as any) as T;
  }
}

class LazyKnexTableQuery {
  private readonly calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(
    private readonly resolveClient: () => Promise<Knex>,
    private readonly naming: NamingStrategy,
    private readonly tableName: string,
  ) {}

  select(...args: unknown[]): this {
    this.calls.push({ method: 'select', args });
    return this;
  }

  where(...args: unknown[]): this {
    this.calls.push({ method: 'where', args });
    return this;
  }

  orderBy(...args: unknown[]): this {
    this.calls.push({ method: 'orderBy', args });
    return this;
  }

  limit(...args: unknown[]): this {
    this.calls.push({ method: 'limit', args });
    return this;
  }

  offset(...args: unknown[]): this {
    this.calls.push({ method: 'offset', args });
    return this;
  }

  async insert(data: unknown): Promise<unknown> {
    const client = await this.resolveClient();
    const query = this.buildQuery(client);
    return query.insert(this.mapData(data) as any);
  }

  async update(data: unknown): Promise<unknown> {
    const client = await this.resolveClient();
    const query = this.buildQuery(client);
    return query.update(this.mapData(data) as any);
  }

  async delete(): Promise<unknown> {
    const client = await this.resolveClient();
    const query = this.buildQuery(client);
    return query.delete();
  }

  async get(): Promise<unknown[]> {
    const client = await this.resolveClient();
    const rows = await this.buildQuery(client);
    return Array.isArray(rows) ? rows : [];
  }

  async first(): Promise<unknown> {
    const client = await this.resolveClient();
    const query = this.buildQuery(client);
    return query.first();
  }

  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.get().then(onfulfilled, onrejected);
  }

  private buildQuery(client: Knex): Knex.QueryBuilder {
    let query = client(this.naming.fieldToColumnName(this.tableName));
    for (const call of this.calls) {
      query = (query as any)[call.method](...this.mapArgs(call.method, call.args));
    }
    return query;
  }

  private mapArgs(method: string, args: unknown[]): unknown[] {
    switch (method) {
      case 'select':
        return this.mapSelectArgs(args);
      case 'where':
        if (args.length === 1 && isPlainObject(args[0])) {
          return [this.mapData(args[0])];
        }
        return args.map((arg, index) => index === 0 && typeof arg === 'string'
          ? this.naming.fieldToColumnName(arg)
          : arg);
      case 'orderBy':
        return args.map((arg, index) => index === 0 ? this.mapOrderByArg(arg) : arg);
      default:
        return args;
    }
  }

  private mapSelectArgs(args: unknown[]): unknown[] {
    return args.flatMap((arg) =>
      Array.isArray(arg)
        ? arg.map((item) => this.mapSelectArg(item))
        : [this.mapSelectArg(arg)],
    );
  }

  private mapSelectArg(arg: unknown): unknown {
    if (typeof arg === 'string') {
      return this.mapSelectIdentifier(arg);
    }
    if (Array.isArray(arg)) {
      return arg.map((item) => this.mapSelectArg(item));
    }
    if (isPlainObject(arg)) {
      return Object.fromEntries(
        Object.entries(arg).map(([alias, value]) => [
          alias,
          typeof value === 'string' ? this.naming.fieldToColumnName(value) : value,
        ]),
      );
    }
    return arg;
  }

  private mapSelectIdentifier(identifier: string): unknown {
    const columnName = this.naming.fieldToColumnName(identifier);
    if (shouldAliasSelectIdentifier(identifier, columnName)) {
      return { [identifier]: columnName };
    }
    return columnName;
  }

  private mapIdentifierArg(arg: unknown): unknown {
    if (typeof arg === 'string') {
      return this.naming.fieldToColumnName(arg);
    }
    if (Array.isArray(arg)) {
      return arg.map((item) => this.mapIdentifierArg(item));
    }
    return arg;
  }

  private mapOrderByArg(arg: unknown): unknown {
    if (typeof arg === 'string') {
      return this.naming.fieldToColumnName(arg);
    }
    if (Array.isArray(arg)) {
      return arg.map((item) => this.mapOrderByArg(item));
    }
    if (isPlainObject(arg)) {
      return Object.fromEntries(
        Object.entries(arg).map(([key, value]) => [
          key === 'column' && typeof value === 'string'
            ? key
            : this.naming.fieldToColumnName(key),
          key === 'column' && typeof value === 'string'
            ? this.naming.fieldToColumnName(value)
            : value,
        ]),
      );
    }
    return arg;
  }

  private mapData(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data.map((item) => this.mapData(item));
    }
    if (!data || typeof data !== 'object') {
      return data;
    }
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [this.naming.fieldToColumnName(key), value]),
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function shouldAliasSelectIdentifier(identifier: string, columnName: string): boolean {
  return identifier !== columnName
    && isSimpleIdentifier(identifier)
    && isSimpleIdentifier(columnName);
}

function isSimpleIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function normalizeKnexDialect(client: string): string {
  switch (client) {
    case 'better-sqlite3':
    case 'sqlite3':
      return 'sqlite';
    case 'pg':
    case 'postgres':
    case 'postgresql':
      return 'postgres';
    case 'mysql':
    case 'mysql2':
      return 'mysql';
    default:
      return client;
  }
}

export function resolveDatabaseCapabilities(
  dialect: string,
  overrides: Partial<DatabaseCapabilities> = {},
): DatabaseCapabilities {
  const base: DatabaseCapabilities = {
    schemas: false,
    views: true,
    replaceView: true,
    materializedViews: false,
    refreshMaterializedViews: false,
    foreignKeys: true,
    deferrableConstraints: false,
    partialIndexes: false,
    nativeTypes: false,
    comments: false,
  };

  if (dialect === 'postgres') {
    Object.assign(base, {
      schemas: true,
      materializedViews: true,
      refreshMaterializedViews: true,
      deferrableConstraints: true,
      partialIndexes: true,
      nativeTypes: true,
      comments: true,
    });
  }

  if (dialect === 'mysql') {
    Object.assign(base, {
      schemas: false,
      replaceView: true,
      comments: true,
      nativeTypes: true,
    });
  }

  if (dialect === 'sqlite') {
    Object.assign(base, {
      partialIndexes: true,
    });
  }

  return { ...base, ...overrides };
}
