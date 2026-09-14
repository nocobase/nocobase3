import type { RepositoryRecord } from '@nocobase/repository-input';
import { RepositoryError } from '../errors.js';
import { normalizeRepositoryPolicy } from './normalize.js';
import type {
  PolicyRef,
  PolicyScalarValue,
  PolicyScope,
  RepositoryPolicy,
} from './types.js';

type PolicyPath = readonly (string | number)[];

function invalid(message: string, path: PolicyPath): never {
  throw new RepositoryError('INVALID_POLICY', message, { path });
}

/**
 * Run a node callback, holding it to the same discipline the write policy
 * builder uses: synchronous, and returning the builder it was handed.
 */
function run<T>(
  configure: (builder: T) => T,
  builder: T,
  path: PolicyPath,
): void {
  if (typeof configure !== 'function' || configure(builder) !== builder) {
    invalid('Policy callback must synchronously return its own builder.', path);
  }
}

export interface ReadPolicyNodeBuilder<
  TRecord extends object = RepositoryRecord,
> {
  /** Rows this node may read. Required, as it is when the node is written out. */
  scope(scope: true | PolicyScope<TRecord>): this;
  /** Scalar allowlist. Fields never named stay unreadable. */
  fields(...fields: readonly string[]): this;
  /** Expand a relation, either with its own rules or by referring to another. */
  relation(
    relation: string,
    configure:
      PolicyRef | ((read: ReadPolicyNodeBuilder) => ReadPolicyNodeBuilder),
  ): this;
}

export interface WritePolicyNodeBuilder<
  TRecord extends object = RepositoryRecord,
> {
  scope(scope: true | PolicyScope<TRecord>): this;
  fields(...fields: readonly string[]): this;
  relation(
    relation: string,
    configure: (write: RelationPolicyNodeBuilder) => RelationPolicyNodeBuilder,
  ): this;
}

export interface CreatePolicyNodeBuilder<
  TRecord extends object = RepositoryRecord,
> extends WritePolicyNodeBuilder<TRecord> {
  /** Values the server assigns. A caller-supplied field of the same name wins. */
  defaults(values: Readonly<Record<string, PolicyScalarValue>>): this;
}

export interface DeletePolicyNodeBuilder<
  TRecord extends object = RepositoryRecord,
> {
  scope(scope: true | PolicyScope<TRecord>): this;
}

export interface RelationShapePolicyBuilder {
  fields(...fields: readonly string[]): this;
  relation(
    relation: string,
    configure: (write: RelationPolicyNodeBuilder) => RelationPolicyNodeBuilder,
  ): this;
}

export interface RelationCreateShapePolicyBuilder extends RelationShapePolicyBuilder {
  /** Many-to-many payload carried on the join row. */
  through(
    configure: (
      through: ThroughFieldsPolicyBuilder,
    ) => ThroughFieldsPolicyBuilder,
  ): this;
}

export interface ThroughFieldsPolicyBuilder {
  fields(...fields: readonly string[]): this;
}

export interface ThroughPolicyBuilder {
  through(
    configure: (
      through: ThroughFieldsPolicyBuilder,
    ) => ThroughFieldsPolicyBuilder,
  ): this;
}

export interface RelationUpsertPolicyBuilder {
  create(
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this;
  update(
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this;
}

export interface RelationPolicyNodeBuilder {
  /** Targets this relation may reach. Omitted leaves the target unscoped. */
  scope(scope: true | PolicyScope): this;
  create(
    configure: (
      shape: RelationCreateShapePolicyBuilder,
    ) => RelationCreateShapePolicyBuilder,
  ): this;
  update(
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this;
  upsert(
    configure: (
      branches: RelationUpsertPolicyBuilder,
    ) => RelationUpsertPolicyBuilder,
  ): this;
  connect(
    configure?: (edge: ThroughPolicyBuilder) => ThroughPolicyBuilder,
  ): this;
  set(configure?: (edge: ThroughPolicyBuilder) => ThroughPolicyBuilder): this;
  disconnect(): this;
  delete(): this;
}

export interface RepositoryPolicyBuilder<
  TRecord extends object = RepositoryRecord,
> {
  read(
    node:
      | boolean
      | ((
          read: ReadPolicyNodeBuilder<TRecord>,
        ) => ReadPolicyNodeBuilder<TRecord>),
  ): this;
  create(
    node:
      | boolean
      | ((
          create: CreatePolicyNodeBuilder<TRecord>,
        ) => CreatePolicyNodeBuilder<TRecord>),
  ): this;
  update(
    node:
      | boolean
      | ((
          update: WritePolicyNodeBuilder<TRecord>,
        ) => WritePolicyNodeBuilder<TRecord>),
  ): this;
  delete(
    node:
      | boolean
      | ((
          remove: DeletePolicyNodeBuilder<TRecord>,
        ) => DeletePolicyNodeBuilder<TRecord>),
  ): this;
}

/**
 * The shared half of every node builder: a scope, a field allowlist, and the
 * bookkeeping that refuses to accept the same member twice.
 */
class NodeBuilder {
  protected readonly data: Record<string, unknown> = {};
  constructor(protected readonly path: PolicyPath) {}
  protected reserve(key: string): PolicyPath {
    if (key in this.data) {
      invalid(`${key} may only be declared once.`, [...this.path, key]);
    }
    this.data[key] = undefined;
    return [...this.path, key];
  }
  scope(scope: unknown): this {
    this.reserve('scope');
    this.data.scope = scope;
    return this;
  }
  fields(...fields: readonly string[]): this {
    this.reserve('fields');
    this.data.fields = [...fields];
    return this;
  }
  result(): Record<string, unknown> {
    return this.data;
  }
}

class ReadNodeBuilder extends NodeBuilder implements ReadPolicyNodeBuilder {
  private readonly children = new Map<string, unknown>();
  relation(
    relation: string,
    configure:
      PolicyRef | ((read: ReadPolicyNodeBuilder) => ReadPolicyNodeBuilder),
  ): this {
    const path = this.relationPath(relation);
    if (typeof configure === 'function') {
      const builder = new ReadNodeBuilder(path);
      run(configure, builder, path);
      this.children.set(relation, builder.result());
    } else {
      this.children.set(relation, configure);
    }
    this.data.relations = Object.fromEntries(this.children);
    return this;
  }
  private relationPath(relation: string): PolicyPath {
    if (this.children.has(relation)) {
      invalid('Relation may only be declared once.', [
        ...this.path,
        'relations',
        relation,
      ]);
    }
    this.children.set(relation, undefined);
    return [...this.path, 'relations', relation];
  }
}

/** Shared by the root write nodes and by each relation write shape. */
class WriteShapeBuilder extends NodeBuilder implements WritePolicyNodeBuilder {
  private readonly children = new Map<string, unknown>();
  relation(
    relation: string,
    configure: (write: RelationPolicyNodeBuilder) => RelationPolicyNodeBuilder,
  ): this {
    if (this.children.has(relation)) {
      invalid('Relation may only be declared once.', [
        ...this.path,
        'relations',
        relation,
      ]);
    }
    const path = [...this.path, 'relations', relation];
    const builder = new RelationNodeBuilder(path);
    run(configure, builder, path);
    this.children.set(relation, builder.result());
    this.data.relations = Object.fromEntries(this.children);
    return this;
  }
}

class CreateNodeBuilder
  extends WriteShapeBuilder
  implements CreatePolicyNodeBuilder
{
  defaults(values: Readonly<Record<string, PolicyScalarValue>>): this {
    this.reserve('defaults');
    this.data.defaults = values;
    return this;
  }
}

class RelationShapeBuilder
  extends WriteShapeBuilder
  implements RelationCreateShapePolicyBuilder
{
  through(
    configure: (
      through: ThroughFieldsPolicyBuilder,
    ) => ThroughFieldsPolicyBuilder,
  ): this {
    const path = this.reserve('through');
    const builder = new NodeBuilder(path);
    run(configure, builder, path);
    this.data.through = builder.result();
    return this;
  }
}

class EdgeBuilder implements ThroughPolicyBuilder {
  private readonly data: Record<string, unknown> = {};
  constructor(private readonly path: PolicyPath) {}
  through(
    configure: (
      through: ThroughFieldsPolicyBuilder,
    ) => ThroughFieldsPolicyBuilder,
  ): this {
    if ('through' in this.data) {
      invalid('through may only be declared once.', [...this.path, 'through']);
    }
    const path = [...this.path, 'through'];
    const builder = new NodeBuilder(path);
    run(configure, builder, path);
    this.data.through = builder.result();
    return this;
  }
  result(): Record<string, unknown> {
    return this.data;
  }
}

class UpsertBuilder implements RelationUpsertPolicyBuilder {
  private readonly data: Record<string, unknown> = {};
  constructor(private readonly path: PolicyPath) {}
  private branch(
    key: 'create' | 'update',
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this {
    if (key in this.data) {
      invalid('Upsert branch may only be declared once.', [...this.path, key]);
    }
    const path = [...this.path, key];
    const builder = new RelationShapeBuilder(path);
    run(configure, builder, path);
    this.data[key] = builder.result();
    return this;
  }
  create(
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this {
    return this.branch('create', configure);
  }
  update(
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this {
    return this.branch('update', configure);
  }
  result(): Record<string, unknown> {
    return this.data;
  }
}

class RelationNodeBuilder implements RelationPolicyNodeBuilder {
  private readonly data: Record<string, unknown> = {};
  constructor(private readonly path: PolicyPath) {}
  private reserve(key: string): PolicyPath {
    if (key in this.data) {
      invalid(`Relation ${key} may only be declared once.`, [
        ...this.path,
        key,
      ]);
    }
    this.data[key] = undefined;
    return [...this.path, key];
  }
  scope(scope: true | PolicyScope): this {
    this.reserve('scope');
    this.data.scope = scope;
    return this;
  }
  create(
    configure: (
      shape: RelationCreateShapePolicyBuilder,
    ) => RelationCreateShapePolicyBuilder,
  ): this {
    const path = this.reserve('create');
    const builder = new RelationShapeBuilder(path);
    run(configure, builder, path);
    this.data.create = builder.result();
    return this;
  }
  update(
    configure: (
      shape: RelationShapePolicyBuilder,
    ) => RelationShapePolicyBuilder,
  ): this {
    const path = this.reserve('update');
    const builder = new RelationShapeBuilder(path);
    run(configure, builder, path);
    this.data.update = builder.result();
    return this;
  }
  upsert(
    configure: (
      branches: RelationUpsertPolicyBuilder,
    ) => RelationUpsertPolicyBuilder,
  ): this {
    const path = this.reserve('upsert');
    const builder = new UpsertBuilder(path);
    run(configure, builder, path);
    this.data.upsert = builder.result();
    return this;
  }
  private edge(
    operation: 'connect' | 'set',
    configure?: (edge: ThroughPolicyBuilder) => ThroughPolicyBuilder,
  ): this {
    const path = this.reserve(operation);
    const builder = new EdgeBuilder(path);
    if (configure !== undefined) run(configure, builder, path);
    this.data[operation] = builder.result();
    return this;
  }
  connect(
    configure?: (edge: ThroughPolicyBuilder) => ThroughPolicyBuilder,
  ): this {
    return this.edge('connect', configure);
  }
  set(configure?: (edge: ThroughPolicyBuilder) => ThroughPolicyBuilder): this {
    return this.edge('set', configure);
  }
  disconnect(): this {
    this.reserve('disconnect');
    this.data.disconnect = {};
    return this;
  }
  delete(): this {
    this.reserve('delete');
    this.data.delete = {};
    return this;
  }
  result(): Record<string, unknown> {
    return this.data;
  }
}

class PolicyBuilder implements RepositoryPolicyBuilder {
  private readonly data: Record<string, unknown> = {};
  private node(
    key: 'read' | 'create' | 'update' | 'delete',
    node: unknown,
    builder: () => NodeBuilder | RelationNodeBuilder,
  ): this {
    if (key in this.data) {
      invalid(`${key} may only be declared once.`, [key]);
    }
    if (typeof node === 'boolean') {
      this.data[key] = node;
      return this;
    }
    const instance = builder();
    run(node as (value: unknown) => unknown, instance, [key]);
    this.data[key] = instance.result();
    return this;
  }
  read(node: unknown): this {
    return this.node('read', node, () => new ReadNodeBuilder(['read']));
  }
  create(node: unknown): this {
    return this.node('create', node, () => new CreateNodeBuilder(['create']));
  }
  update(node: unknown): this {
    return this.node('update', node, () => new WriteShapeBuilder(['update']));
  }
  delete(node: unknown): this {
    return this.node('delete', node, () => new NodeBuilder(['delete']));
  }
  /** Every node the caller did not mention is denied. */
  result(): Record<string, unknown> {
    return {
      read: false,
      create: false,
      update: false,
      delete: false,
      ...this.data,
    };
  }
}

/**
 * Build a Repository Policy from a callback.
 *
 * A node the callback never mentions is `false`, so the four-node requirement
 * costs nothing to satisfy while the default stays refusal. `scope` is not
 * defaulted the same way: a node that is declared without one is refused,
 * exactly as a hand-written Policy is, because a missing scope reads as
 * configured while leaving every row reachable.
 *
 * The result is normalized and frozen here, so a malformed Policy fails where
 * it is written rather than where it is bound. Normalization is idempotent, so
 * binding it later normalizes a second time without changing it.
 *
 * Note that a Policy built this way loses its literal type, so `withPolicy`
 * degrades the record type to `Partial<TRecord>` even when `read` is `true`.
 * Write the object out when that precision matters.
 */
export function buildRepositoryPolicy<
  TRecord extends object = RepositoryRecord,
>(
  configure: (
    policy: RepositoryPolicyBuilder<TRecord>,
  ) => RepositoryPolicyBuilder<TRecord>,
): RepositoryPolicy<TRecord> {
  const builder = new PolicyBuilder();
  run(
    configure as unknown as (value: PolicyBuilder) => PolicyBuilder,
    builder,
    [],
  );
  return normalizeRepositoryPolicy(
    builder.result() as unknown as RepositoryPolicy<TRecord>,
  );
}
