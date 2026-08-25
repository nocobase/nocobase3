export type CollectionKind = 'table' | 'view' | 'materializedView';

export type FieldType =
  | 'increments'
  | 'integer'
  | 'bigInt'
  | 'string'
  | 'text'
  | 'boolean'
  | 'decimal'
  | 'float'
  | 'double'
  | 'date'
  | 'time'
  | 'datetime'
  | 'json'
  | 'uuid'
  | 'native'
  | 'belongsTo'
  | 'hasOne'
  | 'hasMany'
  | 'belongsToMany'
  | string;

export type Deferrable = boolean | 'immediate' | 'deferred';
export type ReferentialAction =
  'cascade' | 'restrict' | 'set null' | 'no action';
export type FilterExpression = Record<string, unknown>;
export type DialectOptions = Record<string, unknown>;
export type RelationType = 'belongsTo' | 'hasOne' | 'hasMany' | 'belongsToMany';

export interface NamingOptions {
  underscored?: boolean;
  tablePrefix?: string;
}

export interface DbOptions {
  schema?: string;
  comment?: string;
  nativeType?: string;
  [dialect: string]: unknown;
}

export interface FieldBase {
  name: string;
  title?: string;
  description?: string;
  nullable?: boolean;
  defaultValue?: unknown;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
  index?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  interface?: string;
  uiSchema?: Record<string, unknown>;
  db?: DbOptions;
}

export interface FieldDefinition extends FieldBase {
  type: FieldType;
  columnName?: string;
  target?: never;
  sourceKey?: never;
  targetKey?: never;
  foreignKey?: never;
  foreignKeyType?: never;
  otherKey?: never;
  through?: never;
  constraints?: never;
  onDelete?: never;
  onUpdate?: never;
}

export type RelationFieldDefinition = FieldBase & {
  type: RelationType;
  columnName?: never;
  target: string;
  sourceKey?: string;
  targetKey?: string;
  foreignKey?: string;
  foreignKeyType?: FieldType;
  otherKey?: string;
  through?: string;
  constraints?: boolean;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
};

export type AnyFieldDefinition = FieldDefinition | RelationFieldDefinition;

export interface PrimaryConstraintDefinition {
  type: 'primary';
  fields: string[];
  name?: string;
  deferrable?: Deferrable;
  db?: DialectOptions;
}

export interface UniqueConstraintDefinition {
  type: 'unique';
  fields: string[];
  name?: string;
  mode?: 'auto' | 'constraint' | 'index';
  deferrable?: Deferrable;
  indexType?: string;
  predicate?: FilterExpression;
  db?: DialectOptions;
}

export interface ForeignKeyConstraintDefinition {
  type: 'foreignKey';
  fields: string[];
  references: {
    collection: string;
    fields?: string[];
  };
  name?: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  deferrable?: Deferrable;
  db?: DialectOptions;
}

export interface CheckConstraintDefinition {
  type: 'check';
  name?: string;
  expression: FilterExpression | string;
  db?: DialectOptions;
}

export type ConstraintDefinition =
  | PrimaryConstraintDefinition
  | UniqueConstraintDefinition
  | ForeignKeyConstraintDefinition
  | CheckConstraintDefinition;

export interface IndexDefinition {
  fields?: string[];
  expressions?: unknown[];
  name?: string;
  type?: string;
  predicate?: FilterExpression;
  order?: Record<string, 'asc' | 'desc'>;
  db?: DialectOptions;
}

export interface QueryViewDefinition {
  from: string;
  select: string[];
  filter?: FilterExpression;
}

export interface RawViewDefinition {
  sql: string;
  bindings?: unknown[];
}

export interface ViewOptions {
  as?: QueryViewDefinition;
  asRaw?: RawViewDefinition;
  refresh?: {
    strategy?: 'manual' | 'scheduled';
  };
}

export interface CollectionDefinition {
  kind?: CollectionKind;
  name?: string;
  tableName?: string;
  naming?: NamingOptions;
  title?: string;
  description?: string;
  writable?: boolean;
  db?: DbOptions;
  fields?: AnyFieldDefinition[];
  constraints?: ConstraintDefinition[];
  indexes?: IndexDefinition[];
  view?: ViewOptions;
}

export type FieldAlterInput = Partial<Omit<FieldDefinition, 'name'>>;

export interface CollectionAlterDefinition {
  addFields?: AnyFieldDefinition[];
  alterFields?: Array<{ name: string; changes: FieldAlterInput }>;
  dropFields?: string[];
  addIndexes?: IndexDefinition[];
  dropIndexes?: string[];
  addConstraints?: ConstraintDefinition[];
  dropConstraints?: string[];
}

export interface FieldMetadataPatch {
  title?: string;
  description?: string;
  interface?: string;
  uiSchema?: Record<string, unknown>;
}

export interface CollectionMetadataPatch {
  title?: string;
  description?: string;
  fields?: Record<string, FieldMetadataPatch>;
}

export type CollectionDefinitionInput =
  CollectionDefinition | ((collection: CollectionDefinitionBuilder) => void);

export type CollectionAlterInput =
  CollectionAlterDefinition | ((collection: CollectionAlterBuilder) => void);

export type ViewCollectionInput =
  CollectionDefinition | ((view: ViewCollectionDefinitionBuilder) => void);

export type MaterializedViewCollectionInput = ViewCollectionInput;

export interface BuilderExecOptions {
  /** Compile operations without executing schema changes or syncing metadata. */
  dryRun?: boolean;
  /** Return adapter SQL when supported. Best used together with dryRun. */
  previewSql?: boolean;
  /** Defaults to true. Set false to skip Collection metadata writes. */
  syncMetadata?: boolean;
  /** Skip supported create operations when the backing database object already exists. */
  ifNotExists?: boolean;
  /** Skip supported drop operations when the backing database object does not exist. */
  ifExists?: boolean;
  /**
   * Fails on capability warnings during real execution.
   * This is not a destructive-operation confirmation mechanism; inspect impact.
   */
  strict?: boolean;
  /**
   * Reserved for future Builder-managed transactions.
   * Use DatabaseManager.transaction() or DatabaseConnection.transaction() today.
   */
  transaction?: boolean;
}

export interface MetadataUpdateOptions {
  strict?: boolean;
}

export interface RefreshMaterializedViewOptions extends BuilderExecOptions {
  concurrently?: boolean;
}

export interface BuilderWarning {
  code: string;
  message: string;
  path?: Array<string | number>;
  capability?: string;
  dialect?: string;
  fallback?: 'downgrade' | 'skip' | 'ignore';
  severity?: 'warning' | 'unsafe';
}

export interface BuilderImpact {
  level: 'safe' | 'warning' | 'destructive';
  message: string;
  operation?: string;
}

export interface MetadataChangeSet {
  updated?: string[];
  created?: string[];
  removed?: string[];
}

export interface BuilderResult {
  operations: CollectionOperation[];
  schemaOperations?: SchemaOperation[];
  sql?: string[];
  /** Reserved change summary; current Builder implementation does not populate it yet. */
  metadata?: MetadataChangeSet;
  warnings?: BuilderWarning[];
  impact?: BuilderImpact[];
}

export type CollectionOperation =
  | {
      type: 'createCollection';
      name: string;
      definition: CollectionDefinition;
      ifNotExists?: boolean;
    }
  | {
      type: 'alterCollection';
      collection: string;
      changes: CollectionAlterDefinition;
    }
  | { type: 'dropCollection'; collection: string; ifExists?: boolean }
  | {
      type: 'renameCollection';
      from: string;
      to: string;
      renameTable?: boolean;
      renameTableTo?: string;
    }
  | {
      type: 'createViewCollection';
      name: string;
      definition: CollectionDefinition;
    }
  | {
      type: 'replaceViewCollection';
      name: string;
      definition: CollectionDefinition;
    }
  | {
      type: 'createMaterializedViewCollection';
      name: string;
      definition: CollectionDefinition;
    }
  | {
      type: 'refreshMaterializedViewCollection';
      collection: string;
      concurrently?: boolean;
    }
  | { type: 'addField'; collection: string; field: AnyFieldDefinition }
  | {
      type: 'alterField';
      collection: string;
      field: string;
      changes: FieldAlterInput;
    }
  | { type: 'dropField'; collection: string; field: string }
  | { type: 'addIndex'; collection: string; index: IndexDefinition }
  | { type: 'dropIndex'; collection: string; index: string }
  | {
      type: 'addConstraint';
      collection: string;
      constraint: ConstraintDefinition;
    }
  | { type: 'dropConstraint'; collection: string; constraint: string }
  | {
      type: 'updateCollectionMetadata';
      collection: string;
      patch: CollectionMetadataPatch;
    }
  | {
      type: 'updateFieldMetadata';
      collection: string;
      field: string;
      patch: FieldMetadataPatch;
    };

export type SchemaOperation =
  | { type: 'createTable'; table: TableSchemaDefinition; ifNotExists?: boolean }
  | {
      type: 'alterTable';
      tableName: string;
      db?: DbOptions;
      operations: TableAlterSchemaOperation[];
    }
  | { type: 'dropTable'; tableName: string; db?: DbOptions; ifExists?: boolean }
  | { type: 'renameTable'; from: string; to: string; db?: DbOptions }
  | {
      type: 'createView';
      view: ViewSchemaDefinition;
      orReplace?: boolean;
      materialized?: boolean;
    }
  | {
      type: 'refreshMaterializedView';
      viewName: string;
      db?: DbOptions;
      concurrently?: boolean;
    };

export interface TableSchemaDefinition {
  name: string;
  db?: DbOptions;
  columns: ColumnSchemaDefinition[];
  indexes: PhysicalIndexDefinition[];
  constraints: PhysicalConstraintDefinition[];
}

export interface ViewSchemaDefinition {
  name: string;
  db?: DbOptions;
  columns: string[];
  query?: QueryViewDefinition;
  raw?: RawViewDefinition;
  indexes?: PhysicalIndexDefinition[];
}

export type TableAlterSchemaOperation =
  | { type: 'addColumn'; column: ColumnSchemaDefinition }
  | {
      type: 'alterColumn';
      column: string;
      changes: Partial<ColumnSchemaDefinition>;
    }
  | { type: 'dropColumn'; column: string }
  | { type: 'addIndex'; index: PhysicalIndexDefinition }
  | { type: 'dropIndex'; name: string }
  | { type: 'addConstraint'; constraint: PhysicalConstraintDefinition }
  | { type: 'dropConstraint'; name: string };

export interface ColumnSchemaDefinition {
  name: string;
  type: FieldType;
  nullable?: boolean;
  defaultValue?: unknown;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  db?: DbOptions;
}

export interface PhysicalIndexDefinition extends Omit<
  IndexDefinition,
  'fields'
> {
  columns?: string[];
}

export type PhysicalConstraintDefinition =
  | (Omit<PrimaryConstraintDefinition, 'fields'> & { columns: string[] })
  | (Omit<UniqueConstraintDefinition, 'fields'> & { columns: string[] })
  | (Omit<ForeignKeyConstraintDefinition, 'fields' | 'references'> & {
      columns: string[];
      references: {
        table: string;
        columns: string[];
      };
    })
  | CheckConstraintDefinition;

export interface CollectionDefinitionBuilder {
  tableName(name: string): this;
  mapToTable(name: string): this;
  naming(options: NamingOptions): this;
  dbSchema(schema: string): this;
  title(title: string): this;
  description(description: string): this;
  field(field: AnyFieldDefinition): FieldDefinitionBuilder;
  increments(name?: string): FieldDefinitionBuilder;
  integer(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  bigInt(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  string(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  text(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  boolean(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  decimal(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  datetime(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  json(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  uuid(
    name: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  native(
    name: string,
    nativeType: string,
    options?: Partial<FieldDefinition>,
  ): FieldDefinitionBuilder;
  belongsTo(
    name: string,
    target: string,
    options?: Partial<RelationFieldDefinition>,
  ): RelationFieldBuilder;
  hasOne(
    name: string,
    target: string,
    options?: Partial<RelationFieldDefinition>,
  ): RelationFieldBuilder;
  hasMany(
    name: string,
    target: string,
    options?: Partial<RelationFieldDefinition>,
  ): RelationFieldBuilder;
  belongsToMany(
    name: string,
    target: string,
    options?: Partial<RelationFieldDefinition>,
  ): RelationFieldBuilder;
  primary(
    fields: string | string[],
    options?: Omit<PrimaryConstraintDefinition, 'type' | 'fields'>,
  ): this;
  unique(
    fields: string | string[],
    options?: Omit<UniqueConstraintDefinition, 'type' | 'fields'>,
  ): this;
  foreignKey(
    fields: string | string[],
    options: Omit<ForeignKeyConstraintDefinition, 'type' | 'fields'>,
  ): this;
  index(
    fields: string | string[],
    options?: Omit<IndexDefinition, 'fields'>,
  ): this;
  toDefinition(): CollectionDefinition;
}

export interface CollectionAlterBuilder extends CollectionDefinitionBuilder {
  alterField(name: string, changes: FieldAlterInput): this;
  dropField(name: string): this;
  dropFields(...names: string[]): this;
  dropIndex(name: string): this;
  dropConstraint(name: string): this;
  toAlterDefinition(): CollectionAlterDefinition;
}

export interface ViewCollectionDefinitionBuilder extends CollectionDefinitionBuilder {
  as(
    query:
      QueryViewDefinition | ((query: ViewQueryBuilder) => ViewQueryBuilder),
  ): this;
  asRaw(sql: string, bindings?: unknown[]): this;
  refresh(options: NonNullable<ViewOptions['refresh']>): this;
}

export interface ViewQueryBuilder {
  from(collection: string): this;
  select(...fields: string[]): this;
  where(field: string, operator: string, value: unknown): this;
  toQuery(): QueryViewDefinition;
}

export interface FieldDefinitionBuilder {
  primary(options?: Omit<PrimaryConstraintDefinition, 'type' | 'fields'>): this;
  autoIncrement(): this;
  notNull(): this;
  nullable(): this;
  defaultTo(value: unknown): this;
  unique(options?: Omit<UniqueConstraintDefinition, 'type' | 'fields'>): this;
  index(options?: Omit<IndexDefinition, 'fields'>): this;
  columnName(name: string): this;
  mapToColumn(name: string): this;
  title(title: string): this;
  description(description: string): this;
  dbComment(comment: string): this;
  db(options: DbOptions): this;
  unsigned(): this;
  references(ref: {
    collection: string;
    field?: string;
    fields?: string[];
  }): this;
  toDefinition(): AnyFieldDefinition;
}

export interface RelationFieldBuilder {
  primary(options?: Omit<PrimaryConstraintDefinition, 'type' | 'fields'>): this;
  autoIncrement(): this;
  notNull(): this;
  nullable(): this;
  defaultTo(value: unknown): this;
  unique(options?: Omit<UniqueConstraintDefinition, 'type' | 'fields'>): this;
  index(options?: Omit<IndexDefinition, 'fields'>): this;
  title(title: string): this;
  description(description: string): this;
  dbComment(comment: string): this;
  db(options: DbOptions): this;
  unsigned(): this;
  toDefinition(): RelationFieldDefinition;
  target(target: string): this;
  sourceKey(key: string): this;
  targetKey(key: string): this;
  foreignKey(key: string): this;
  foreignKeyType(type: FieldType): this;
  otherKey(key: string): this;
  through(collection: string): this;
  constraints(value?: boolean): this;
  onDelete(action: ReferentialAction): this;
  onUpdate(action: ReferentialAction): this;
}
