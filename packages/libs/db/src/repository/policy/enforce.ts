import type { FilterAst, FilterNode } from '@nocobase/repository-input';
import type { CollectionDefinition } from '../../collection/types.js';
import { invalid, isPlainRecord } from '../internal/guards.js';
import type {
  RelationWritePolicy,
  ThroughWritePolicy,
  WritePolicy,
} from '../write-policy.js';
import type {
  NormalizedCreateNode,
  NormalizedDeleteNode,
  NormalizedReadNode,
  NormalizedRelationShapeNode,
  NormalizedRelationWriteNode,
  NormalizedRepositoryPolicy,
  NormalizedWriteNode,
  PolicyRef,
} from './types.js';

/** The mutation nodes that carry a row scope. `create` is judged after the write. */
export type PolicyMutationOperation = 'update' | 'delete';

/**
 * Resolve the read node, rejecting the call outright when reading is forbidden.
 * Returns `undefined` when no Policy is bound and `true` when it adds no limits.
 */
export function resolveReadNode(
  policy: NormalizedRepositoryPolicy | undefined,
  collection: CollectionDefinition,
): NormalizedReadNode | true | undefined {
  const node = policy?.read;
  if (node === false) {
    invalid(
      'READ_FORBIDDEN',
      'Reading from this Repository is forbidden by Policy.',
      { collection: collection.name },
    );
  }
  return node;
}

/** The scalar field allowlist of the bound read node, or `undefined` when unbound. */
export function policyReadFields(
  policy: NormalizedRepositoryPolicy | undefined,
): readonly string[] | undefined {
  const node = policy?.read;
  return node && typeof node === 'object' ? node.fields : undefined;
}

/** The relation allowlist of the bound read node, or `undefined` when unbound. */
export function policyReadRelations(
  policy: NormalizedRepositoryPolicy | undefined,
): Readonly<Record<string, NormalizedReadNode | PolicyRef>> | undefined {
  const node = policy?.read;
  return node && typeof node === 'object' ? node.relations : undefined;
}

/**
 * Resolve the node behind an `update` or `delete`, rejecting the call outright
 * when the operation is forbidden.
 */
export function resolveMutationNode(
  policy: NormalizedRepositoryPolicy | undefined,
  operation: PolicyMutationOperation,
  collection: CollectionDefinition,
): NormalizedWriteNode | NormalizedDeleteNode | true | undefined {
  const node = operation === 'update' ? policy?.update : policy?.delete;
  if (node === false) {
    invalid('WRITE_FORBIDDEN', `${operation} is forbidden by Policy.`, {
      collection: collection.name,
    });
  }
  return node;
}

/**
 * Resolve the node behind a `create` or `update` write shape, rejecting the
 * call outright when the operation is forbidden.
 */
export function resolveWriteShapeNode(
  policy: NormalizedRepositoryPolicy | undefined,
  operation: 'create' | 'update',
  collection: CollectionDefinition,
): NormalizedCreateNode | NormalizedWriteNode | true | undefined {
  const node = operation === 'create' ? policy?.create : policy?.update;
  if (node === false) {
    invalid('WRITE_FORBIDDEN', `${operation} is forbidden by Policy.`, {
      collection: collection.name,
    });
  }
  return node;
}

/**
 * Apply `create.defaults` to caller values. Caller-provided fields win; the
 * fields the server assigned that the caller may not write itself are reported
 * so the write-shape check can let them through.
 */
export function applyCreateDefaults(
  policy: NormalizedRepositoryPolicy | undefined,
  input: unknown,
): { readonly values: unknown; readonly protectedFields: readonly string[] } {
  const node = policy?.create;
  if (!node || node === true || !isPlainRecord(input)) {
    return { values: input, protectedFields: [] };
  }
  const protectedFields = Object.keys(node.defaults).filter(
    (field) => !node.fields.includes(field) && !Object.hasOwn(input, field),
  );
  const defaults = Object.fromEntries(
    Object.entries(node.defaults).map(([field, value]) => [
      field,
      value instanceof Date ? new Date(value) : value,
    ]),
  );
  return { values: { ...defaults, ...input }, protectedFields };
}

/** Intersect the caller filter with a Policy scope without flattening either side. */
export function combinePolicyFilter(
  caller: FilterAst | undefined,
  policy: FilterAst | undefined,
  collection: string,
): FilterAst | undefined {
  if (!caller) return policy;
  if (!policy) return caller;
  return {
    kind: 'filter',
    version: 1,
    collection,
    root: {
      kind: 'group',
      logic: 'and',
      items: [caller.root, policy.root],
    },
  };
}

/**
 * Project a normalized write node onto the legacy `WritePolicy` shape so the
 * existing mutation checks can run unchanged.
 *
 * This bridge is deliberately temporary. `RelationWriteNode.scope` has nowhere
 * to live in the legacy structure, so it comes apart when relation write
 * targets land; see decision 0.9 in the policy roadmap.
 */
export function toWritePolicy(policy: NormalizedWriteNode): WritePolicy {
  return {
    fields: policy.fields,
    relations: Object.fromEntries(
      Object.entries(policy.relations).map(([name, relation]) => [
        name,
        toRelationWritePolicy(relation),
      ]),
    ),
  };
}

export function toRelationWritePolicy(
  policy: NormalizedRelationWriteNode,
): RelationWritePolicy {
  const shape = (node: NormalizedRelationShapeNode): WritePolicy => ({
    fields: node.fields,
    relations: Object.fromEntries(
      Object.entries(node.relations).map(([name, relation]) => [
        name,
        toRelationWritePolicy(relation),
      ]),
    ),
  });
  const through = (node: {
    readonly through?: false | { readonly fields: readonly string[] };
  }): ThroughWritePolicy =>
    node.through === false
      ? { through: false }
      : node.through === undefined
        ? {}
        : { through: { fields: node.through.fields } };
  return {
    ...(policy.create
      ? { create: { ...shape(policy.create), ...through(policy.create) } }
      : {}),
    ...(policy.update ? { update: shape(policy.update) } : {}),
    ...(policy.upsert
      ? {
          upsert: {
            create: shape(policy.upsert.create),
            update: shape(policy.upsert.update),
          },
        }
      : {}),
    ...(policy.connect ? { connect: through(policy.connect) } : {}),
    ...(policy.set ? { set: through(policy.set) } : {}),
    ...(policy.disconnect ? { disconnect: {} } : {}),
    ...(policy.delete ? { delete: {} } : {}),
  };
}

/**
 * What a bound Policy allows on one collection, at one point in a read.
 *
 * Every read validator takes this as a required argument. A call site with no
 * Policy passes {@link UNRESTRICTED_READ} rather than omitting the argument, so
 * a new read path cannot silently skip the checks — leaving it out is a
 * compile error instead of a leak.
 */
export type PolicyReadContext =
  | { readonly kind: 'unrestricted' }
  | {
      readonly kind: 'restricted';
      /** The declared allowlist. Decides what a query with no select returns. */
      readonly fields: readonly string[];
      /**
       * What the caller may name, which is the allowlist plus the foreign keys
       * an authorized relation already gives away. Refusing `ownerId` while
       * allowing `owner { id }` hides nothing — the same value comes back by
       * the other route — so the two are kept in step.
       *
       * The implication runs one way only. A readable `ownerId` says nothing
       * about whether `owner` may be expanded, because the target carries
       * other fields.
       */
      readonly readableFields: readonly string[];
      readonly relations: Readonly<
        Record<string, NormalizedReadNode | PolicyRef>
      >;
      readonly scope: true | FilterAst;
    };

export const UNRESTRICTED_READ: PolicyReadContext = Object.freeze({
  kind: 'unrestricted' as const,
});

/** Build the root read context, rejecting the call when reading is forbidden. */
export function rootReadContext(
  policy: NormalizedRepositoryPolicy | undefined,
  collection: CollectionDefinition,
): PolicyReadContext {
  const node = resolveReadNode(policy, collection);
  return node === undefined || node === true
    ? UNRESTRICTED_READ
    : restrictedReadContext(collection, node);
}

/**
 * Build a restricted context, widening the nameable fields by the foreign keys
 * the authorized relations already expose.
 */
export function restrictedReadContext(
  collection: CollectionDefinition,
  node: NormalizedReadNode,
): PolicyReadContext {
  return {
    kind: 'restricted',
    fields: node.fields,
    readableFields: withImpliedForeignKeys(collection, node),
    relations: node.relations,
    scope: node.scope,
  };
}

function withImpliedForeignKeys(
  collection: CollectionDefinition,
  node: NormalizedReadNode,
): readonly string[] {
  const implied: string[] = [];
  for (const [name, child] of Object.entries(node.relations)) {
    if ('kind' in child) continue;
    const relation = collection.fields?.find(
      (field) => field.name === name && 'target' in field,
    );
    const foreignKey =
      relation && 'foreignKey' in relation ? relation.foreignKey : undefined;
    if (!foreignKey || node.fields.includes(foreignKey)) continue;
    // The key is only given away when the relation actually returns the value
    // the foreign key points at.
    const targetKey =
      relation && 'targetKey' in relation ? relation.targetKey : undefined;
    const revealsKey = targetKey
      ? child.fields.includes(targetKey)
      : child.fields.length > 0;
    if (revealsKey) implied.push(foreignKey);
  }
  return implied.length > 0 ? [...node.fields, ...implied] : node.fields;
}

/**
 * Descend into a relation, rejecting the expansion when the Policy does not
 * authorize it. Returns the context that governs the relation target, which is
 * the target collection's allowlist — never the parent's.
 */
export function relationReadContext(
  parent: PolicyReadContext,
  collection: CollectionDefinition,
  relation: string,
  path: readonly (string | number)[],
  target: CollectionDefinition,
): PolicyReadContext {
  if (parent.kind === 'unrestricted') return UNRESTRICTED_READ;
  const node = parent.relations[relation];
  if (node === undefined) {
    invalid(
      'RELATION_READ_FORBIDDEN',
      `Relation "${relation}" is not readable by Policy.`,
      { collection: collection.name, relation, path },
    );
  }
  if ('kind' in node) {
    invalid(
      'RELATION_READ_FORBIDDEN',
      `Relation "${relation}" is not resolved by Policy.`,
      { collection: collection.name, relation, path },
    );
  }
  // The node governs the target, so its own relations are resolved there.
  return restrictedReadContext(target, node);
}

/** The scalar allowlist, or `undefined` when this context adds no limits. */
export function readableFields(
  policy: PolicyReadContext,
): readonly string[] | undefined {
  return policy.kind === 'restricted' ? policy.fields : undefined;
}

/**
 * Reject a caller reference to a field outside the read allowlist. Used by
 * every surface that names a field without returning it — filter, sort,
 * distinct, cursor, group by, aggregate — because each of them leaks the
 * value just as surely as selecting it would.
 */
export function assertReadableField(
  policy: PolicyReadContext,
  collection: CollectionDefinition,
  field: string,
  path: readonly (string | number)[],
): void {
  if (policy.kind === 'unrestricted' || policy.readableFields.includes(field)) {
    return;
  }
  invalid(
    'FIELD_READ_FORBIDDEN',
    `Field "${field}" is not readable by Policy.`,
    { collection: collection.name, field, path },
  );
}

/**
 * Collect the root-level fields a scope reads.
 *
 * A write that touches none of them cannot move a record out of that scope,
 * which is what lets the ordinary update path stay free of extra statements.
 * Relation nodes contribute nothing: a scope may not traverse relations, so
 * one appearing here is a normalization bug rather than a field to watch.
 */
export function scopeFieldNames(scope: FilterAst): readonly string[] {
  const names = new Set<string>();
  const visit = (node: FilterNode): void => {
    if (node.kind === 'condition') {
      if (node.path.length === 1) names.add(node.path[0]);
      return;
    }
    if (node.kind === 'group') {
      node.items.forEach(visit);
      return;
    }
    for (const item of node.filter?.items ?? []) visit(item);
  };
  scope.root.items.forEach(visit);
  return [...names];
}

/**
 * Refuse a `create` node whose scope references a field the operation can
 * never give a value to.
 *
 * `scope: <status ne 'archived'>` with `fields: ['title']` and no default for
 * `status` describes a create that can never succeed: the column takes
 * whatever the database supplies, the record is judged against a condition
 * nobody could influence, and every call inserts, fails the check and rolls
 * back — reporting an error about `values`, which the caller cannot fix.
 *
 * The three inputs are all static, so this is worth catching before the first
 * insert rather than once per call. A field that has a column default is
 * accepted: whether that default satisfies the condition is a comparison only
 * the database can make, and the write-back check makes it.
 *
 * This runs when the Collection first resolves rather than at `withPolicy`,
 * because binding is synchronous and the Collection is not.
 */
export function assertCreateScopeSatisfiable(
  collection: CollectionDefinition,
  node: NormalizedCreateNode,
): void {
  if (node.scope === true) return;
  for (const name of scopeFieldNames(node.scope)) {
    if (node.fields.includes(name) || Object.hasOwn(node.defaults, name)) {
      continue;
    }
    const field = collection.fields?.find((item) => item.name === name);
    if (!field || 'target' in field) continue;
    const hasValueSource =
      field.defaultValue !== undefined ||
      field.db?.generated !== undefined ||
      field.autoIncrement === true ||
      field.type === 'increments' ||
      collection.optimisticLock?.field === name;
    if (hasValueSource) continue;
    invalid(
      'INVALID_POLICY',
      `create.scope reads Field "${name}", which this create can never set: it is absent from create.fields and create.defaults, and the Collection gives it no default.`,
      {
        collection: collection.name,
        field: name,
        path: ['policy', 'create', 'scope'],
      },
    );
  }
}

/**
 * Hand a Policy out without a live reference to anything mutable.
 *
 * Every other value in a normalized Policy is frozen or a primitive, but
 * `Object.freeze` does not reach a Date's internal time: `setTime` still works
 * on one. Since `explainPolicy` returns the very object `applyCreateDefaults`
 * reads from, a caller could change a server-assigned default after binding.
 * Copying on the way out is what actually closes that.
 */
export function detachPolicy(
  policy: NormalizedRepositoryPolicy,
): NormalizedRepositoryPolicy {
  const node = policy.create;
  if (node === true || node === false) return policy;
  const entries = Object.entries(node.defaults);
  if (!entries.some(([, value]) => value instanceof Date)) return policy;
  return Object.freeze({
    ...policy,
    create: Object.freeze({
      ...node,
      defaults: Object.freeze(
        Object.fromEntries(
          entries.map(([field, value]) => [
            field,
            value instanceof Date ? new Date(value) : value,
          ]),
        ),
      ),
    }),
  });
}
