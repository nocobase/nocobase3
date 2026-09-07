import { RepositoryError } from './errors.js';

export interface FieldWritePolicy {
  readonly fields?: false | readonly string[];
}
export interface WritePolicy extends FieldWritePolicy {
  readonly relations?: false | Readonly<Record<string, RelationWritePolicy>>;
}
export interface ThroughWritePolicy {
  readonly through?: false | FieldWritePolicy;
}
export interface RelationCreateWritePolicy
  extends WritePolicy, ThroughWritePolicy {}
export interface UpsertWritePolicy {
  readonly create: WritePolicy;
  readonly update: WritePolicy;
}
export interface RelationWritePolicy {
  readonly create?: RelationCreateWritePolicy;
  readonly update?: WritePolicy;
  readonly upsert?: UpsertWritePolicy;
  readonly connect?: ThroughWritePolicy;
  readonly set?: ThroughWritePolicy;
  readonly disconnect?: Readonly<Record<string, never>>;
  readonly delete?: Readonly<Record<string, never>>;
}
export type RelationWriteOperation = keyof RelationWritePolicy;
export interface FieldWritePolicyBuilder {
  fields(...fields: string[]): this;
}
export interface WritePolicyBuilder extends FieldWritePolicyBuilder {
  relation(
    name: string,
    configure: (
      relation: RelationWritePolicyBuilder,
    ) => RelationWritePolicyBuilder,
  ): this;
}
export interface RelationCreateWritePolicyBuilder extends WritePolicyBuilder {
  through(
    configure: (through: FieldWritePolicyBuilder) => FieldWritePolicyBuilder,
  ): this;
}
export interface ThroughWritePolicyBuilder {
  through(
    configure: (through: FieldWritePolicyBuilder) => FieldWritePolicyBuilder,
  ): this;
}
export interface UpsertWritePolicyBuilder {
  create(configure: (write: WritePolicyBuilder) => WritePolicyBuilder): this;
  update(configure: (write: WritePolicyBuilder) => WritePolicyBuilder): this;
}
export interface RelationWritePolicyBuilder {
  create(
    configure: (
      write: RelationCreateWritePolicyBuilder,
    ) => RelationCreateWritePolicyBuilder,
  ): this;
  update(configure: (write: WritePolicyBuilder) => WritePolicyBuilder): this;
  upsert(
    configure: (branches: UpsertWritePolicyBuilder) => UpsertWritePolicyBuilder,
  ): this;
  connect(
    configure?: (edge: ThroughWritePolicyBuilder) => ThroughWritePolicyBuilder,
  ): this;
  set(
    configure?: (edge: ThroughWritePolicyBuilder) => ThroughWritePolicyBuilder,
  ): this;
  disconnect(): this;
  delete(): this;
}
export type WritePolicyInput =
  WritePolicy | ((write: WritePolicyBuilder) => WritePolicyBuilder);
export type FieldWritePolicyInput =
  | FieldWritePolicy
  | ((write: FieldWritePolicyBuilder) => FieldWritePolicyBuilder);
export type UpsertWritePolicyInput =
  | UpsertWritePolicy
  | ((branches: UpsertWritePolicyBuilder) => UpsertWritePolicyBuilder);
export type PolicyPath = readonly (string | number)[];

export const relationWriteOperations: readonly RelationWriteOperation[] = [
  'create',
  'update',
  'upsert',
  'connect',
  'disconnect',
  'set',
  'delete',
];

export function invalidWritePolicy(message: string, path: PolicyPath): never {
  throw new RepositoryError('INVALID_WRITE_POLICY', message, { path });
}
function object(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
function name(value: unknown, path: PolicyPath): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('.') ||
    value.includes('*')
  )
    invalidWritePolicy(
      'Expected a direct field or relation name without wildcards.',
      path,
    );
}
function keys(
  value: unknown,
  allowed: readonly string[],
  path: PolicyPath,
): asserts value is Record<string, unknown> {
  if (!object(value))
    invalidWritePolicy('Expected a plain policy object.', path);
  for (const key of Reflect.ownKeys(value))
    if (typeof key !== 'string' || !allowed.includes(key))
      invalidWritePolicy(`Unsupported policy option: ${String(key)}.`, [
        ...path,
        String(key),
      ]);
}
function fieldPolicy(value: unknown, path: PolicyPath): FieldWritePolicy {
  keys(value, ['fields'], path);
  if (value.fields === undefined || value.fields === false)
    return Object.freeze({ fields: false });
  if (!Array.isArray(value.fields))
    invalidWritePolicy(
      'fields must be false or an array of direct field names.',
      [...path, 'fields'],
    );
  const fields: string[] = [];
  for (const [index, field] of value.fields.entries()) {
    name(field, [...path, 'fields', index]);
    if (fields.includes(field))
      invalidWritePolicy('fields must not contain duplicates.', [
        ...path,
        'fields',
        index,
      ]);
    fields.push(field);
  }
  return Object.freeze({ fields: Object.freeze(fields) });
}
function throughPolicy(value: unknown, path: PolicyPath): ThroughWritePolicy {
  keys(value, ['through'], path);
  return Object.freeze({
    through:
      value.through === undefined || value.through === false
        ? false
        : fieldPolicy(value.through, [...path, 'through']),
  });
}
function snapshot(
  value: unknown,
  path: PolicyPath,
  mode: 'create' | 'update',
  ancestors: Set<object>,
  allowThrough = false,
): RelationCreateWritePolicy {
  keys(
    value,
    allowThrough ? ['fields', 'relations', 'through'] : ['fields', 'relations'],
    path,
  );
  if (ancestors.has(value))
    invalidWritePolicy('Policy must not contain cycles.', path);
  ancestors.add(value);
  const fields = fieldPolicy({ fields: value.fields }, path);
  let relations: WritePolicy['relations'] = false;
  if (value.relations !== undefined && value.relations !== false) {
    if (!object(value.relations))
      invalidWritePolicy('relations must be false or a plain object.', [
        ...path,
        'relations',
      ]);
    const relationMap = value.relations;
    const entries = Reflect.ownKeys(relationMap).map((relation) => {
      name(relation, [...path, 'relations', String(relation)]);
      const rule = relationMap[relation];
      const rulePath = [...path, 'relations', relation];
      name(relation, rulePath);
      keys(
        rule,
        mode === 'create' ? ['create', 'connect'] : relationWriteOperations,
        rulePath,
      );
      const operationEntries = Object.getOwnPropertyNames(rule).map(
        (operation) => {
          const config = rule[operation];
          const operationPath = [...rulePath, operation];
          switch (operation) {
            case 'create':
              return [
                operation,
                snapshot(config, operationPath, 'create', ancestors, true),
              ];
            case 'update':
              return [
                operation,
                snapshot(config, operationPath, 'update', ancestors),
              ];
            case 'upsert':
              return [
                operation,
                upsertSnapshot(config, operationPath, ancestors),
              ];
            case 'connect':
            case 'set':
              return [operation, throughPolicy(config, operationPath)];
            default:
              keys(config, [], operationPath);
              return [operation, Object.freeze({})];
          }
        },
      );
      return [relation, Object.freeze(Object.fromEntries(operationEntries))];
    });
    relations = Object.freeze(Object.fromEntries(entries));
  }
  ancestors.delete(value);
  return Object.freeze({
    ...fields,
    relations,
    ...(allowThrough ? throughPolicy({ through: value.through }, path) : {}),
  });
}
function upsertSnapshot(
  value: unknown,
  path: PolicyPath,
  ancestors: Set<object>,
): UpsertWritePolicy {
  keys(value, ['create', 'update'], path);
  return Object.freeze({
    create: snapshot(value.create, [...path, 'create'], 'create', ancestors),
    update: snapshot(value.update, [...path, 'update'], 'update', ancestors),
  });
}

// Builder state is private; callbacks cannot replace a branch with a foreign builder.
class FieldsBuilder implements FieldWritePolicyBuilder {
  protected readonly data: Record<string, unknown> = {};
  protected readonly declared = new Set<string>();
  constructor(protected readonly path: PolicyPath) {}
  protected reserve(key: string): void {
    if (this.declared.has(key))
      invalidWritePolicy('Policy member may only be declared once.', [
        ...this.path,
        key,
      ]);
    this.declared.add(key);
  }
  fields(...fields: string[]): this {
    this.reserve('fields');
    this.data.fields = [...fields];
    return this;
  }
  result(): Record<string, unknown> {
    return this.data;
  }
}
function callback<T>(
  configure: (builder: T) => T,
  builder: T,
  path: PolicyPath,
): void {
  if (typeof configure !== 'function' || configure(builder) !== builder)
    invalidWritePolicy(
      'Policy callback must synchronously return its own builder.',
      path,
    );
}
class RecordBuilder
  extends FieldsBuilder
  implements RelationCreateWritePolicyBuilder
{
  private readonly relations = new Map<string, unknown>();
  relation(
    relation: string,
    configure: (
      builder: RelationWritePolicyBuilder,
    ) => RelationWritePolicyBuilder,
  ): this {
    name(relation, [...this.path, 'relations']);
    this.reserve(`relations.${relation}`);
    const builder = new RelationBuilder([...this.path, 'relations', relation]);
    callback(configure, builder, builder.location);
    this.relations.set(relation, builder.result());
    this.data.relations = Object.fromEntries(this.relations);
    return this;
  }
  through(
    configure: (builder: FieldWritePolicyBuilder) => FieldWritePolicyBuilder,
  ): this {
    this.reserve('through');
    const builder = new FieldsBuilder([...this.path, 'through']);
    callback(configure, builder, [...this.path, 'through']);
    this.data.through = builder.result();
    return this;
  }
}
class EdgeBuilder implements ThroughWritePolicyBuilder {
  private value?: FieldWritePolicy;
  private declared = false;
  constructor(private readonly path: PolicyPath) {}
  through(
    configure: (builder: FieldWritePolicyBuilder) => FieldWritePolicyBuilder,
  ): this {
    if (this.declared)
      invalidWritePolicy('through may only be declared once.', this.path);
    this.declared = true;
    const builder = new FieldsBuilder([...this.path, 'through']);
    callback(configure, builder, [...this.path, 'through']);
    this.value = fieldPolicy(builder.result(), [...this.path, 'through']);
    return this;
  }
  result(): ThroughWritePolicy {
    return { through: this.value };
  }
}
class BranchBuilder implements UpsertWritePolicyBuilder {
  private readonly branches = new Map<string, unknown>();
  constructor(private readonly path: PolicyPath) {}
  private branch(
    key: 'create' | 'update',
    configure: (write: WritePolicyBuilder) => WritePolicyBuilder,
  ): this {
    if (this.branches.has(key))
      invalidWritePolicy('Upsert branch may only be declared once.', [
        ...this.path,
        key,
      ]);
    this.branches.set(key, undefined);
    const builder = new RecordBuilder([...this.path, key]);
    callback(configure, builder, [...this.path, key]);
    this.branches.set(key, builder.result());
    return this;
  }
  create(configure: (write: WritePolicyBuilder) => WritePolicyBuilder): this {
    return this.branch('create', configure);
  }
  update(configure: (write: WritePolicyBuilder) => WritePolicyBuilder): this {
    return this.branch('update', configure);
  }
  result(): Record<string, unknown> {
    return Object.fromEntries(this.branches);
  }
}
class RelationBuilder implements RelationWritePolicyBuilder {
  private readonly operations = new Map<string, unknown>();
  constructor(readonly location: PolicyPath) {}
  private reserve(key: string): PolicyPath {
    if (this.operations.has(key))
      invalidWritePolicy('Relation operation may only be declared once.', [
        ...this.location,
        key,
      ]);
    this.operations.set(key, undefined);
    return [...this.location, key];
  }
  create(
    configure: (
      write: RelationCreateWritePolicyBuilder,
    ) => RelationCreateWritePolicyBuilder,
  ): this {
    const path = this.reserve('create');
    const builder = new RecordBuilder(path);
    callback(configure, builder, path);
    this.operations.set('create', builder.result());
    return this;
  }
  update(configure: (write: WritePolicyBuilder) => WritePolicyBuilder): this {
    const path = this.reserve('update');
    const builder = new RecordBuilder(path);
    callback(configure, builder, path);
    this.operations.set('update', builder.result());
    return this;
  }
  upsert(
    configure: (branches: UpsertWritePolicyBuilder) => UpsertWritePolicyBuilder,
  ): this {
    const path = this.reserve('upsert');
    const builder = new BranchBuilder(path);
    callback(configure, builder, path);
    this.operations.set('upsert', builder.result());
    return this;
  }
  private edge(
    operation: 'connect' | 'set',
    configure?: (edge: ThroughWritePolicyBuilder) => ThroughWritePolicyBuilder,
  ): this {
    const path = this.reserve(operation);
    const builder = new EdgeBuilder(path);
    if (configure !== undefined) callback(configure, builder, path);
    this.operations.set(operation, builder.result());
    return this;
  }
  connect(
    configure?: (edge: ThroughWritePolicyBuilder) => ThroughWritePolicyBuilder,
  ): this {
    return this.edge('connect', configure);
  }
  set(
    configure?: (edge: ThroughWritePolicyBuilder) => ThroughWritePolicyBuilder,
  ): this {
    return this.edge('set', configure);
  }
  disconnect(): this {
    this.reserve('disconnect');
    this.operations.set('disconnect', {});
    return this;
  }
  delete(): this {
    this.reserve('delete');
    this.operations.set('delete', {});
    return this;
  }
  result(): Record<string, unknown> {
    return Object.fromEntries(this.operations);
  }
}

/** Build a detached, frozen policy. No fields or relations are allowed by default. */
export function buildWritePolicy(input: WritePolicyInput = {}): WritePolicy {
  return normalizeWritePolicy(input, 'update');
}
/** Build independent create/update rules for a root upsert. Both branches are required. */
export function buildUpsertWritePolicy(
  input: UpsertWritePolicyInput,
): UpsertWritePolicy {
  let value: unknown = input;
  if (typeof input === 'function') {
    const builder = new BranchBuilder(['writePolicy']);
    callback(input, builder, ['writePolicy']);
    value = builder.result();
  }
  return upsertSnapshot(value, ['writePolicy'], new Set());
}
export function normalizeWritePolicy(
  input: WritePolicyInput,
  mode: 'create' | 'update',
): WritePolicy {
  let value: unknown = input;
  if (typeof input === 'function') {
    const builder = new RecordBuilder(['writePolicy']);
    callback(input, builder, ['writePolicy']);
    value = builder.result();
  }
  return snapshot(value, ['writePolicy'], mode, new Set());
}
export function normalizeFieldWritePolicy(
  input: FieldWritePolicyInput,
): FieldWritePolicy {
  let value: unknown = input;
  if (typeof input === 'function') {
    const builder = new FieldsBuilder(['writePolicy']);
    callback(input, builder, ['writePolicy']);
    value = builder.result();
  }
  return fieldPolicy(value, ['writePolicy']);
}
export function assertWriteEnabled<T>(
  policy: T,
): asserts policy is Exclude<T, false> {
  if (policy === false)
    throw new RepositoryError(
      'WRITE_FORBIDDEN',
      'Writing is disabled by writePolicy.',
      { path: ['writePolicy'] },
    );
}
