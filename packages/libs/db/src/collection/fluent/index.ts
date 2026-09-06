import type {
  AnyFieldDefinition,
  CollectionAlterBuilder,
  CollectionAlterDefinition,
  CollectionDefinition,
  CollectionDefinitionBuilder,
  DbOptions,
  FieldAlterInput,
  FieldDefinition,
  FieldDefinitionBuilder,
  FieldType,
  ForeignKeyConstraintDefinition,
  IndexDefinition,
  NamingOptions,
  OptimisticLockDefinition,
  PrimaryConstraintDefinition,
  QueryViewDefinition,
  ReferentialAction,
  RelationFieldBuilder,
  RelationFieldDefinition,
  UniqueConstraintDefinition,
  ViewCollectionDefinitionBuilder,
  ViewOptions,
  ViewQueryBuilder,
} from '../types.js';

export class FluentCollectionDefinitionBuilder implements CollectionDefinitionBuilder {
  protected definition: CollectionDefinition = {
    fields: [],
    indexes: [],
    constraints: [],
  };

  naming(options: NamingOptions): this {
    this.definition.naming = { ...(this.definition.naming ?? {}), ...options };
    return this;
  }

  dbSchema(schema: string): this {
    this.definition.db = { ...(this.definition.db ?? {}), schema };
    return this;
  }

  title(title: string): this {
    this.definition.title = title;
    return this;
  }

  description(description: string): this {
    this.definition.description = description;
    return this;
  }

  optimisticLock(field: string): this {
    const optimisticLock: OptimisticLockDefinition = {
      field,
      strategy: 'increment',
    };
    this.definition.optimisticLock = optimisticLock;
    return this;
  }

  field(field: AnyFieldDefinition): FieldDefinitionBuilder {
    const builder = new FluentFieldDefinitionBuilder(this, field);
    this.pushField(builder);
    return builder;
  }

  increments(name: string): FieldDefinitionBuilder {
    return this.field({
      name,
      type: 'increments',
      primaryKey: true,
      autoIncrement: true,
    });
  }

  integer(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'integer', ...options });
  }

  bigInt(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'bigInt', ...options });
  }

  string(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'string', ...options });
  }

  text(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'text', ...options });
  }

  boolean(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'boolean', ...options });
  }

  decimal(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'decimal', ...options });
  }

  datetime(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'datetime', ...options });
  }

  float(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ ...options, name, type: 'float' });
  }

  double(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ ...options, name, type: 'double' });
  }

  date(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ ...options, name, type: 'date' });
  }

  time(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ ...options, name, type: 'time' });
  }

  datetimeTz(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ ...options, name, type: 'datetimeTz' });
  }

  json(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'json', ...options });
  }

  blob(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'blob', ...options });
  }

  uuid(
    name: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({ name, type: 'uuid', ...options });
  }

  native(
    name: string,
    nativeType: string,
    options: Partial<FieldDefinition> = {},
  ): FieldDefinitionBuilder {
    return this.field({
      name,
      type: options.type ?? 'native',
      ...options,
      db: {
        ...(options.db ?? {}),
        nativeType,
      },
    });
  }

  belongsTo(
    name: string,
    target: string,
    options: Partial<RelationFieldDefinition> = {},
  ): RelationFieldBuilder {
    return this.relation({ name, target, type: 'belongsTo', ...options });
  }

  hasOne(
    name: string,
    target: string,
    options: Partial<RelationFieldDefinition> = {},
  ): RelationFieldBuilder {
    return this.relation({ name, target, type: 'hasOne', ...options });
  }

  hasMany(
    name: string,
    target: string,
    options: Partial<RelationFieldDefinition> = {},
  ): RelationFieldBuilder {
    return this.relation({ name, target, type: 'hasMany', ...options });
  }

  belongsToMany(
    name: string,
    target: string,
    options: Partial<RelationFieldDefinition> = {},
  ): RelationFieldBuilder {
    return this.relation({ name, target, type: 'belongsToMany', ...options });
  }

  primary(
    fields: string | string[],
    options: Omit<PrimaryConstraintDefinition, 'type' | 'fields'> = {},
  ): this {
    this.definition.constraints?.push({
      type: 'primary',
      fields: array(fields),
      ...options,
    });
    return this;
  }

  unique(
    fields: string | string[],
    options: Omit<UniqueConstraintDefinition, 'type' | 'fields'> = {},
  ): this {
    this.definition.constraints?.push({
      type: 'unique',
      fields: array(fields),
      ...options,
    });
    return this;
  }

  foreignKey(
    fields: string | string[],
    options: Omit<ForeignKeyConstraintDefinition, 'type' | 'fields'>,
  ): this {
    this.definition.constraints?.push({
      type: 'foreignKey',
      fields: array(fields),
      ...options,
    });
    return this;
  }

  index(
    fields: string | string[],
    options: Omit<IndexDefinition, 'fields'> = {},
  ): this {
    this.definition.indexes?.push({ fields: array(fields), ...options });
    return this;
  }

  toDefinition(): CollectionDefinition {
    return pruneEmpty({
      ...this.definition,
      fields: this.definition.fields?.map((field) => ({ ...field })),
      indexes: this.definition.indexes?.map((index) => ({ ...index })),
      constraints: this.definition.constraints?.map((constraint) => ({
        ...constraint,
      })),
      optimisticLock: this.definition.optimisticLock
        ? { ...this.definition.optimisticLock }
        : undefined,
    });
  }

  protected pushField(builder: FluentFieldDefinitionBuilder): void {
    this.definition.fields?.push(builder.definition);
  }

  private relation(definition: RelationFieldDefinition): RelationFieldBuilder {
    const builder = new FluentRelationFieldBuilder(this, definition);
    this.pushField(builder);
    return builder;
  }
}

export class FluentCollectionAlterBuilder
  extends FluentCollectionDefinitionBuilder
  implements CollectionAlterBuilder
{
  private readonly changes: CollectionAlterDefinition = {
    addFields: [],
    alterFields: [],
    dropFields: [],
    addIndexes: [],
    dropIndexes: [],
    addConstraints: [],
    dropConstraints: [],
  };

  override optimisticLock(field: string): this {
    this.changes.optimisticLock = { field, strategy: 'increment' };
    return this;
  }

  clearOptimisticLock(): this {
    this.changes.optimisticLock = null;
    return this;
  }

  override primary(
    fields: string | string[],
    options: Omit<PrimaryConstraintDefinition, 'type' | 'fields'> = {},
  ): this {
    this.changes.addConstraints?.push({
      type: 'primary',
      fields: array(fields),
      ...options,
    });
    return this;
  }

  override unique(
    fields: string | string[],
    options: Omit<UniqueConstraintDefinition, 'type' | 'fields'> = {},
  ): this {
    this.changes.addConstraints?.push({
      type: 'unique',
      fields: array(fields),
      ...options,
    });
    return this;
  }

  override foreignKey(
    fields: string | string[],
    options: Omit<ForeignKeyConstraintDefinition, 'type' | 'fields'>,
  ): this {
    this.changes.addConstraints?.push({
      type: 'foreignKey',
      fields: array(fields),
      ...options,
    });
    return this;
  }

  override index(
    fields: string | string[],
    options: Omit<IndexDefinition, 'fields'> = {},
  ): this {
    this.changes.addIndexes?.push({ fields: array(fields), ...options });
    return this;
  }

  alterField(name: string, changes: FieldAlterInput): this {
    this.changes.alterFields?.push({ name, changes });
    return this;
  }

  dropField(name: string): this {
    this.changes.dropFields?.push(name);
    return this;
  }

  dropFields(...names: string[]): this {
    this.changes.dropFields?.push(...names);
    return this;
  }

  dropIndex(name: string): this {
    this.changes.dropIndexes?.push(name);
    return this;
  }

  dropConstraint(name: string): this {
    this.changes.dropConstraints?.push(name);
    return this;
  }

  toAlterDefinition(): CollectionAlterDefinition {
    return pruneEmpty({
      ...this.changes,
      addFields: this.definition.fields,
    });
  }
}

export class FluentViewCollectionDefinitionBuilder
  extends FluentCollectionDefinitionBuilder
  implements ViewCollectionDefinitionBuilder
{
  as(
    query:
      QueryViewDefinition | ((query: ViewQueryBuilder) => ViewQueryBuilder),
  ): this {
    const nextQuery =
      typeof query === 'function'
        ? query(new FluentViewQueryBuilder()).toQuery()
        : query;
    this.definition.view = { ...(this.definition.view ?? {}), as: nextQuery };
    return this;
  }

  asRaw(sql: string, bindings?: unknown[]): this {
    this.definition.view = {
      ...(this.definition.view ?? {}),
      asRaw: { sql, bindings },
    };
    return this;
  }

  refresh(options: NonNullable<ViewOptions['refresh']>): this {
    this.definition.view = {
      ...(this.definition.view ?? {}),
      refresh: options,
    };
    return this;
  }
}

export class FluentViewQueryBuilder implements ViewQueryBuilder {
  private query: QueryViewDefinition = {
    from: '',
    select: [],
  };

  from(collection: string): this {
    this.query.from = collection;
    return this;
  }

  select(...fields: string[]): this {
    this.query.select.push(...fields);
    return this;
  }

  where(field: string, operator: string, value: unknown): this {
    this.query.filter = {
      ...(this.query.filter ?? {}),
      [field]: { [operatorToFilterOperator(operator)]: value },
    };
    return this;
  }

  toQuery(): QueryViewDefinition {
    return this.query;
  }
}

export class FluentFieldDefinitionBuilder implements FieldDefinitionBuilder {
  constructor(
    protected readonly collection: FluentCollectionDefinitionBuilder,
    public readonly definition: AnyFieldDefinition,
  ) {}

  primary(
    options: Omit<PrimaryConstraintDefinition, 'type' | 'fields'> = {},
  ): this {
    this.definition.primaryKey = true;
    this.collection.primary(this.definition.name, options);
    return this;
  }

  autoIncrement(): this {
    this.definition.autoIncrement = true;
    return this;
  }

  notNull(): this {
    this.definition.nullable = false;
    return this;
  }

  nullable(): this {
    this.definition.nullable = true;
    return this;
  }

  defaultTo(value: unknown): this {
    this.definition.defaultValue = value;
    return this;
  }

  unique(
    options: Omit<UniqueConstraintDefinition, 'type' | 'fields'> = {},
  ): this {
    this.definition.unique = true;
    this.collection.unique(this.definition.name, options);
    return this;
  }

  index(options: Omit<IndexDefinition, 'fields'> = {}): this {
    this.definition.index = true;
    this.collection.index(this.definition.name, options);
    return this;
  }

  title(title: string): this {
    this.definition.title = title;
    return this;
  }

  description(description: string): this {
    this.definition.description = description;
    return this;
  }

  dbComment(comment: string): this {
    this.definition.db = { ...(this.definition.db ?? {}), comment };
    return this;
  }

  db(options: DbOptions): this {
    this.definition.db = { ...(this.definition.db ?? {}), ...options };
    return this;
  }

  unsigned(): this {
    this.definition.unsigned = true;
    return this;
  }

  references(ref: {
    collection: string;
    field?: string;
    fields?: string[];
  }): this {
    this.collection.foreignKey(this.definition.name, {
      references: {
        collection: ref.collection,
        fields: ref.fields ?? (ref.field ? [ref.field] : undefined),
      },
    });
    return this;
  }

  toDefinition(): AnyFieldDefinition {
    return { ...this.definition };
  }
}

export class FluentRelationFieldBuilder
  extends FluentFieldDefinitionBuilder
  implements RelationFieldBuilder
{
  declare definition: RelationFieldDefinition;

  constructor(
    collection: FluentCollectionDefinitionBuilder,
    definition: RelationFieldDefinition,
  ) {
    super(collection, definition);
    this.definition = definition;
  }

  override references(): never {
    throw new Error(
      'Relation fields do not support references(). Define a scalar field for database foreign key constraints.',
    );
  }

  override toDefinition(): RelationFieldDefinition {
    return { ...this.definition };
  }

  target(target: string): this {
    this.definition.target = target;
    return this;
  }

  sourceKey(key: string): this {
    this.definition.sourceKey = key;
    return this;
  }

  targetKey(key: string): this {
    this.definition.targetKey = key;
    return this;
  }

  foreignKey(key: string): this {
    this.definition.foreignKey = key;
    return this;
  }

  foreignKeyType(type: FieldType): this {
    this.definition.foreignKeyType = type;
    return this;
  }

  otherKey(key: string): this {
    this.definition.otherKey = key;
    return this;
  }

  through(collection: string): this {
    this.definition.through = collection;
    return this;
  }

  constraints(value = true): this {
    this.definition.constraints = value;
    return this;
  }

  onDelete(action: ReferentialAction): this {
    this.definition.onDelete = action;
    return this;
  }

  onUpdate(action: ReferentialAction): this {
    this.definition.onUpdate = action;
    return this;
  }
}

function array<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

function pruneEmpty<T extends Record<string, unknown>>(value: T): T {
  for (const key of Object.keys(value)) {
    const current = value[key];
    if (Array.isArray(current) && current.length === 0) {
      delete value[key];
    }
  }
  return value;
}

function operatorToFilterOperator(operator: string): string {
  switch (operator) {
    case '>':
      return '$gt';
    case '>=':
      return '$gte';
    case '<':
      return '$lt';
    case '<=':
      return '$lte';
    case '!=':
    case '<>':
      return '$ne';
    case '=':
    default:
      return '$eq';
  }
}
