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
  return { values: { ...node.defaults, ...input }, protectedFields };
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

/** Reject caller conditions that reference fields outside the read allowlist. */
export function assertPolicyFilterFields(
  collection: CollectionDefinition,
  filter: FilterAst | undefined,
  fields: readonly string[],
): void {
  if (!filter) return;
  const allowed = new Set(fields);
  const visit = (node: FilterNode): void => {
    if (node.kind === 'condition') {
      const field = node.path.length === 1 ? node.path[0] : undefined;
      if (field && !allowed.has(field)) {
        invalid(
          'FIELD_READ_FORBIDDEN',
          `Field "${field}" is not readable by Policy.`,
          {
            collection: collection.name,
            field,
            path: ['filter', 'root'],
          },
        );
      }
      return;
    }
    if (node.kind === 'group') {
      node.items.forEach(visit);
      return;
    }
    for (const item of node.filter?.items ?? []) visit(item);
  };
  filter.root.items.forEach(visit);
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
