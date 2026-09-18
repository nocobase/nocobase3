import type { FilterAst } from '@nocobase/db';
import type {
  AuthorizationCollection,
  DatabaseRecordAccess,
  ResolveAuthorizationCollection,
} from './model.js';
import type {
  PermissionFields,
  ReadPermission,
  RelationShapePermission,
  RelationWritePermission,
  ThroughPermission,
} from './permissions.js';
import { allScopes, scopeAst, type DatabaseScope } from './scope.js';

/** Resolved authorization output; structurally compatible with DB, independently owned. */
export interface ResolvedReadPermission {
  scope: true | FilterAst;
  fields: readonly string[];
  relations: Readonly<Record<string, ResolvedReadPermission>>;
}
export interface ResolvedRelationShape {
  fields: readonly string[];
  relations: Readonly<Record<string, ResolvedRelationWritePermission>>;
  through?: false | { fields: readonly string[] };
}
export interface ResolvedThroughPermission {
  through: false | { fields: readonly string[] };
}
export interface ResolvedRelationWritePermission {
  scope: true | FilterAst;
  create?: ResolvedRelationShape;
  update?: ResolvedRelationShape;
  upsert?: { create: ResolvedRelationShape; update: ResolvedRelationShape };
  connect?: ResolvedThroughPermission;
  disconnect?: Readonly<Record<string, never>>;
  set?: ResolvedThroughPermission;
  delete?: Readonly<Record<string, never>>;
}
export type ResolvedRelations = Readonly<
  Record<string, ResolvedReadPermission | ResolvedRelationWritePermission>
>;

interface RelationResolution {
  resolveCollection: ResolveAuthorizationCollection;
  resolveScope: (
    collection: AuthorizationCollection,
    rules: readonly DatabaseRecordAccess[],
  ) => Promise<DatabaseScope>;
}

function keys(value: object, allowed: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Expected a permission node');
  for (const key of Object.keys(value))
    if (!allowed.includes(key))
      throw new TypeError(`Unsupported permission member: ${key}`);
}
function fields(
  collection: AuthorizationCollection,
  requested: PermissionFields | undefined,
): readonly string[] {
  if (requested === '*') return collection.fields;
  if (
    requested !== undefined &&
    (!Array.isArray(requested) ||
      requested.some(
        (name: unknown) =>
          typeof name !== 'string' || !collection.fields.includes(name),
      ))
  )
    throw new TypeError(`Unknown permission field on ${collection.name}`);
  return [...new Set<string>(requested ?? [])];
}

export class RelationPermissionResolver {
  constructor(private readonly options: RelationResolution) {}

  async resolve(
    source: AuthorizationCollection,
    permissions:
      | false
      | Readonly<Record<string, ReadPermission | RelationWritePermission>>
      | undefined,
    action: string,
    depth = 0,
  ): Promise<ResolvedRelations> {
    if (depth > 32)
      throw new TypeError('Relation permissions exceed the maximum depth');
    const result: Record<
      string,
      ResolvedReadPermission | ResolvedRelationWritePermission
    > = Object.create(null) as Record<
      string,
      ResolvedReadPermission | ResolvedRelationWritePermission
    >;
    if (!permissions) return result;
    if (typeof permissions !== 'object' || Array.isArray(permissions))
      throw new TypeError('Expected relation permissions');
    for (const [name, permission] of Object.entries(permissions)) {
      const relation = source.relations?.[name];
      if (!relation)
        throw new TypeError(
          `Unknown permission relation: ${source.name}.${name}`,
        );
      const target = await this.options.resolveCollection(relation.target);
      if (!target)
        throw new TypeError(`Unknown relation target: ${relation.target}`);
      const scope =
        permission.recordAccess === undefined
          ? true
          : await this.options.resolveScope(target, permission.recordAccess);
      if (scope === false) continue;
      const resolvedScope =
        scope === true ? true : scopeAst(target.name, scope);
      if (action === 'read') {
        keys(permission, ['recordAccess', 'fields', 'relations']);
        const read = permission as ReadPermission;
        result[name] = {
          scope: resolvedScope,
          fields: fields(target, read.fields),
          relations: (await this.resolve(
            target,
            read.relations,
            action,
            depth + 1,
          )) as Record<string, ResolvedReadPermission>,
        };
      } else {
        keys(
          permission,
          action === 'create'
            ? ['recordAccess', 'create', 'connect']
            : [
                'recordAccess',
                'create',
                'update',
                'upsert',
                'connect',
                'disconnect',
                'set',
                'delete',
              ],
        );
        const write = permission as RelationWritePermission;
        const node: ResolvedRelationWritePermission = { scope: resolvedScope };
        if (write.create)
          node.create = {
            ...(await this.shape(target, write.create, action, depth, true)),
            ...(await this.through(relation.through, write.create)),
          };
        if (write.update)
          node.update = await this.shape(target, write.update, action, depth);
        if (write.upsert) {
          keys(write.upsert, ['create', 'update']);
          node.upsert = {
            create: await this.shape(
              target,
              write.upsert.create,
              action,
              depth,
            ),
            update: await this.shape(
              target,
              write.upsert.update,
              action,
              depth,
            ),
          };
        }
        for (const operation of ['connect', 'set'] as const)
          if (write[operation]) {
            keys(write[operation], ['through']);
            node[operation] = await this.through(
              relation.through,
              write[operation],
            );
          }
        for (const operation of ['disconnect', 'delete'] as const)
          if (write[operation]) {
            keys(write[operation], []);
            node[operation] = {};
          }
        result[name] = node;
      }
    }
    return result;
  }

  private async shape(
    target: AuthorizationCollection,
    value: RelationShapePermission,
    action: string,
    depth: number,
    through = false,
  ): Promise<ResolvedRelationShape> {
    keys(
      value,
      through ? ['fields', 'relations', 'through'] : ['fields', 'relations'],
    );
    return {
      fields: fields(target, value.fields),
      relations: await this.resolve(target, value.relations, action, depth + 1),
    };
  }
  private async through(
    collection: string | undefined,
    value: ThroughPermission,
  ): Promise<ResolvedThroughPermission> {
    if (!value.through) return { through: false };
    keys(value.through, ['fields']);
    const target = collection
      ? await this.options.resolveCollection(collection)
      : undefined;
    if (!target)
      throw new TypeError(
        'Through permissions require a many-to-many relation',
      );
    return { through: { fields: fields(target, value.through.fields) } };
  }
}

/**
 * DB has one target scope per relation. Intersect contributing scopes before
 * uniting capabilities, so a capability never escapes its original scope.
 * This is conservative when separate grants have different target scopes.
 */
export function mergeRelationPermissions(
  values: readonly ResolvedRelations[],
  action: string,
): ResolvedRelations {
  const result: Record<
    string,
    ResolvedReadPermission | ResolvedRelationWritePermission
  > = Object.create(null) as Record<
    string,
    ResolvedReadPermission | ResolvedRelationWritePermission
  >;
  for (const name of new Set(values.flatMap((value) => Object.keys(value)))) {
    const nodes = values.flatMap((value) => (value[name] ? [value[name]] : []));
    const scope = allScopes(
      nodes.map((node) => (node.scope === true ? true : node.scope.root)),
    );
    if (scope === false) continue;
    const resolvedScope =
      scope === true
        ? true
        : {
            kind: 'filter' as const,
            version: 1 as const,
            root:
              scope.kind === 'group'
                ? scope
                : {
                    kind: 'group' as const,
                    logic: 'and' as const,
                    items: [scope],
                  },
          };
    if (action === 'read') {
      const reads = nodes as ResolvedReadPermission[];
      result[name] = { scope: resolvedScope, ...mergeShapes(reads, action) };
    } else {
      const writes = nodes as ResolvedRelationWritePermission[];
      const node: ResolvedRelationWritePermission = { scope: resolvedScope };
      for (const operation of ['create', 'update'] as const) {
        const shapes = writes.flatMap((write) =>
          write[operation] ? [write[operation]] : [],
        );
        if (shapes.length) node[operation] = mergeShapes(shapes, action);
      }
      const upserts = writes.flatMap((write) =>
        write.upsert ? [write.upsert] : [],
      );
      if (upserts.length)
        node.upsert = {
          create: mergeShapes(
            upserts.map((upsert) => upsert.create),
            action,
          ),
          update: mergeShapes(
            upserts.map((upsert) => upsert.update),
            action,
          ),
        };
      for (const operation of ['connect', 'set'] as const) {
        const edges = writes.flatMap((write) =>
          write[operation] ? [write[operation]] : [],
        );
        if (edges.length) node[operation] = { through: mergeThrough(edges) };
      }
      for (const operation of ['disconnect', 'delete'] as const)
        if (writes.some((write) => write[operation])) node[operation] = {};
      result[name] = node;
    }
  }
  return result;
}
function mergeShapes(
  nodes: readonly (ResolvedRelationShape | ResolvedReadPermission)[],
  action: string,
): ResolvedRelationShape {
  return {
    fields: [...new Set(nodes.flatMap((node) => node.fields))],
    relations: mergeRelationPermissions(
      nodes.map((node) => node.relations),
      action,
    ),
    ...(nodes.some((node) => 'through' in node)
      ? {
          through: mergeThrough(
            nodes.map((node) => ('through' in node ? node : {})),
          ),
        }
      : {}),
  };
}
function mergeThrough(
  nodes: readonly { through?: false | { fields: readonly string[] } }[],
): false | { fields: readonly string[] } {
  const allowed = nodes.flatMap((node) => (node.through ? [node.through] : []));
  return allowed.length
    ? { fields: [...new Set(allowed.flatMap((node) => node.fields))] }
    : false;
}
