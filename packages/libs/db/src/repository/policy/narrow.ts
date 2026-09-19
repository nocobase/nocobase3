import type { FilterAst } from '@nocobase/repository-input';
import { RepositoryError } from '../errors.js';
import { normalizeRepositoryPolicy } from './normalize.js';
import type {
  NormalizedCreateNode,
  NormalizedDeleteNode,
  NormalizedReadNode,
  NormalizedRelationShapeNode,
  NormalizedRelationWriteNode,
  NormalizedRepositoryPolicy,
  NormalizedThroughNode,
  NormalizedWriteNode,
  PartialRepositoryPolicy,
  PolicyRef,
  RepositoryPolicy,
} from './types.js';

/**
 * Narrow a bound Policy.
 *
 * Every rule here only ever takes away: scopes are ANDed, field lists
 * intersected, relations intersected, and `false` on either side wins. There
 * is deliberately no spelling that widens — a caller holding a narrowed
 * Repository cannot climb back out of it.
 *
 * A patch is a patch: a member it does not mention is left as it was. A member
 * it does mention is intersected with what was there, so `relations: {}` is a
 * way to say "none of them" rather than "no change".
 */
export function narrowRepositoryPolicy<TRecord extends object>(
  current: NormalizedRepositoryPolicy,
  patch: PartialRepositoryPolicy<TRecord>,
): NormalizedRepositoryPolicy {
  assertPatchKeys(patch);
  return Object.freeze({
    read: narrowNode(current.read, patch.read, ['read'], narrowReadNode),
    create: narrowNode(
      current.create,
      patch.create,
      ['create'],
      narrowCreateNode,
    ),
    update: narrowNode(current.update, patch.update, ['update'], (node, item) =>
      narrowWriteNode(node, item, 'update'),
    ),
    delete: narrowNode(
      current.delete,
      patch.delete,
      ['delete'],
      narrowDeleteNode,
    ),
  });
}

type PolicyPath = readonly (string | number)[];

function invalid(message: string, path: PolicyPath): never {
  throw new RepositoryError('INVALID_POLICY', message, { path });
}

function assertPatchKeys(patch: object): void {
  for (const key of Object.keys(patch)) {
    if (!['read', 'create', 'update', 'delete'].includes(key)) {
      invalid(`Unsupported Policy option: ${key}.`, [key]);
    }
  }
}

/**
 * Normalize one patched node by borrowing the full-policy normalizer.
 *
 * A patch node may omit `scope`, which the normalizer requires, so an
 * unrestricted stand-in fills the gap; intersecting with `true` is what an
 * omitted scope means anyway.
 */
function normalizePatchNode(
  key: 'read' | 'create' | 'update' | 'delete',
  node: object,
):
  | NormalizedReadNode
  | NormalizedCreateNode
  | NormalizedWriteNode
  | NormalizedDeleteNode {
  const open = { scope: true } as const;
  const full = {
    read: open,
    create: open,
    update: open,
    delete: open,
    [key]: key === 'read' ? withReadScopes(node) : { scope: true, ...node },
  } as unknown as RepositoryPolicy;
  const normalized = normalizeRepositoryPolicy(full)[key];
  if (normalized === true || normalized === false) {
    invalid('Expected a Policy node.', [key]);
  }
  return normalized;
}

/**
 * Fill in the `scope` a read patch may omit, at every level.
 *
 * A read relation node requires a scope the same way the root does, and a
 * patch that only wants to trim `fields` should not have to restate one.
 * Omitting it means "adds no limit here", which is what `true` intersects to.
 */
function withReadScopes(node: object): object {
  const relations = (node as { relations?: unknown }).relations;
  const filled: Record<string, unknown> = { scope: true, ...node };
  if (relations && typeof relations === 'object' && !Array.isArray(relations)) {
    filled.relations = Object.fromEntries(
      Object.entries(relations as Record<string, unknown>).map(
        ([name, child]) => [
          name,
          child && typeof child === 'object' && !('kind' in child)
            ? withReadScopes(child)
            : child,
        ],
      ),
    );
  }
  return filled;
}

function narrowNode<TNode, TPatch extends object>(
  current: true | false | TNode,
  patch: true | false | TPatch | undefined,
  path: PolicyPath,
  narrow: (current: TNode, patch: object, path: PolicyPath) => TNode,
): true | false | TNode {
  if (patch === undefined) return current;
  if (patch === false || current === false) return false;
  // `true` adds no limits, so it narrows nothing.
  if (patch === true) return current;
  const key = path[0] as 'read' | 'create' | 'update' | 'delete';
  const normalized = normalizePatchNode(key, patch) as TNode;
  if (current === true) return normalized;
  return narrow(current, patch, path);
}

function narrowScope(
  current: true | FilterAst,
  patch: true | FilterAst,
  collection: string | undefined,
): true | FilterAst {
  if (patch === true) return current;
  if (current === true) return patch;
  return Object.freeze({
    kind: 'filter' as const,
    version: 1 as const,
    ...(collection ? { collection } : {}),
    root: Object.freeze({
      kind: 'group' as const,
      logic: 'and' as const,
      items: Object.freeze([current.root, patch.root]),
    }),
  });
}

function narrowFields(
  current: readonly string[],
  patch: readonly string[],
): readonly string[] {
  return Object.freeze(current.filter((field) => patch.includes(field)));
}

function narrowReadNode(
  current: NormalizedReadNode,
  patch: object,
  path: PolicyPath,
): NormalizedReadNode {
  const next = normalizePatchNode('read', patch) as NormalizedReadNode;
  const has = (key: string) => Object.hasOwn(patch, key);
  return Object.freeze({
    scope: has('scope')
      ? narrowScope(current.scope, next.scope, undefined)
      : current.scope,
    fields: has('fields')
      ? narrowFields(current.fields, next.fields)
      : current.fields,
    relations: has('relations')
      ? narrowReadRelations(current.relations, next.relations, path)
      : current.relations,
  });
}

function narrowReadRelations(
  current: Readonly<Record<string, NormalizedReadNode | PolicyRef>>,
  patch: Readonly<Record<string, NormalizedReadNode | PolicyRef>>,
  path: PolicyPath,
): Readonly<Record<string, NormalizedReadNode | PolicyRef>> {
  const result: Record<string, NormalizedReadNode | PolicyRef> = {};
  for (const [name, node] of Object.entries(current)) {
    if (!Object.hasOwn(patch, name)) continue;
    const incoming = patch[name];
    if ('kind' in node || 'kind' in incoming) {
      if (
        'kind' in node &&
        'kind' in incoming &&
        node.target === incoming.target
      ) {
        result[name] = node;
        continue;
      }
      invalid(
        `Relation "${name}" is a Policy reference and cannot be narrowed in place. Narrow the Policy it refers to instead.`,
        [...path, 'relations', name],
      );
    }
    result[name] = Object.freeze({
      scope: narrowScope(node.scope, incoming.scope, undefined),
      fields: narrowFields(node.fields, incoming.fields),
      relations: narrowReadRelations(node.relations, incoming.relations, [
        ...path,
        'relations',
        name,
      ]),
    });
  }
  return Object.freeze(result);
}

function narrowWriteNode(
  current: NormalizedWriteNode,
  patch: object,
  kind: 'create' | 'update' = 'update',
): NormalizedWriteNode {
  // The node kind has to travel with the patch: only `create` accepts
  // `defaults`, so normalizing a create patch as an update rejects it.
  const next = normalizePatchNode(kind, patch) as NormalizedWriteNode;
  const has = (key: string) => Object.hasOwn(patch, key);
  return Object.freeze({
    scope: has('scope')
      ? narrowScope(current.scope, next.scope, undefined)
      : current.scope,
    fields: has('fields')
      ? narrowFields(current.fields, next.fields)
      : current.fields,
    relations: has('relations')
      ? narrowWriteRelations(current.relations, next.relations)
      : current.relations,
  });
}

function narrowCreateNode(
  current: NormalizedCreateNode,
  patch: object,
): NormalizedCreateNode {
  const next = normalizePatchNode('create', patch) as NormalizedCreateNode;
  return Object.freeze({
    ...narrowWriteNode(current, patch, 'create'),
    // Defaults are server-assigned values rather than a permission, so a patch
    // replaces the ones it names and leaves the rest.
    defaults: Object.hasOwn(patch, 'defaults')
      ? Object.freeze({ ...current.defaults, ...next.defaults })
      : current.defaults,
  });
}

function narrowDeleteNode(
  current: NormalizedDeleteNode,
  patch: object,
): NormalizedDeleteNode {
  const next = normalizePatchNode('delete', patch);
  return Object.freeze({
    scope: Object.hasOwn(patch, 'scope')
      ? narrowScope(current.scope, next.scope, undefined)
      : current.scope,
  });
}

function narrowWriteRelations(
  current: Readonly<Record<string, NormalizedRelationWriteNode>>,
  patch: Readonly<Record<string, NormalizedRelationWriteNode>>,
): Readonly<Record<string, NormalizedRelationWriteNode>> {
  const result: Record<string, NormalizedRelationWriteNode> = {};
  for (const [name, node] of Object.entries(current)) {
    if (!Object.hasOwn(patch, name)) continue;
    result[name] = narrowRelationWrite(node, patch[name]);
  }
  return Object.freeze(result);
}

function narrowRelationWrite(
  current: NormalizedRelationWriteNode,
  patch: NormalizedRelationWriteNode,
): NormalizedRelationWriteNode {
  const result: {
    scope?: true | FilterAst;
    create?: NormalizedRelationShapeNode;
    update?: NormalizedRelationShapeNode;
    upsert?: {
      create: NormalizedRelationShapeNode;
      update: NormalizedRelationShapeNode;
    };
    connect?: NormalizedThroughNode;
    disconnect?: Readonly<Record<string, never>>;
    set?: NormalizedThroughNode;
    delete?: Readonly<Record<string, never>>;
  } = {};
  if (current.scope !== undefined || patch.scope !== undefined) {
    result.scope = narrowScope(
      current.scope ?? true,
      patch.scope ?? true,
      undefined,
    );
  }
  // An operation the patch leaves out is withdrawn: relation operations are
  // each an explicit grant, so intersecting them means keeping only the ones
  // both sides granted.
  if (current.create && patch.create) {
    result.create = narrowRelationShape(current.create, patch.create);
  }
  if (current.update && patch.update) {
    result.update = narrowRelationShape(current.update, patch.update);
  }
  if (current.upsert && patch.upsert) {
    result.upsert = Object.freeze({
      create: narrowRelationShape(current.upsert.create, patch.upsert.create),
      update: narrowRelationShape(current.upsert.update, patch.upsert.update),
    });
  }
  if (current.connect && patch.connect) {
    result.connect = narrowThrough(current.connect, patch.connect);
  }
  if (current.set && patch.set) {
    result.set = narrowThrough(current.set, patch.set);
  }
  if (current.disconnect && patch.disconnect)
    result.disconnect = Object.freeze({});
  if (current.delete && patch.delete) result.delete = Object.freeze({});
  return Object.freeze(result);
}

function narrowRelationShape(
  current: NormalizedRelationShapeNode,
  patch: NormalizedRelationShapeNode,
): NormalizedRelationShapeNode {
  return Object.freeze({
    fields: narrowFields(current.fields, patch.fields),
    relations: narrowWriteRelations(current.relations, patch.relations),
    ...(current.through !== undefined
      ? { through: narrowThroughFields(current.through, patch.through) }
      : {}),
  });
}

function narrowThrough(
  current: NormalizedThroughNode,
  patch: NormalizedThroughNode,
): NormalizedThroughNode {
  return Object.freeze({
    through: narrowThroughFields(current.through, patch.through),
  });
}

function narrowThroughFields(
  current: false | { readonly fields: readonly string[] } | undefined,
  patch: false | { readonly fields: readonly string[] } | undefined,
): false | { readonly fields: readonly string[] } {
  if (!current || !patch) return false;
  return Object.freeze({ fields: narrowFields(current.fields, patch.fields) });
}
