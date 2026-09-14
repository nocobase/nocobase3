import type { DatabaseConnection } from '@nocobase/db';
import type {
  AuthorizationCollection,
  ResolveAuthorizationCollection,
} from './model.js';

/** A resource is `<source>.<collection>`; a bare name takes the plugin's source. */
export function databaseResourceId(source: string, name: string): string {
  return name.includes('.') ? name : `${source}.${name}`;
}

/** The inverse: a scope and a Repository both name the Collection alone. */
export function databaseCollectionName(resourceId: string): string {
  const separator = resourceId.indexOf('.');
  return separator === -1 ? resourceId : resourceId.slice(separator + 1);
}

const relationTypes: ReadonlySet<string> = new Set([
  'belongsTo',
  'hasOne',
  'hasMany',
  'belongsToMany',
]);

/**
 * Reads one Collection's metadata from db. db's registry caches, so this stays
 * a plain lookup rather than a second cache that could disagree with it.
 */
export function collectionResolver(
  connection: DatabaseConnection,
): ResolveAuthorizationCollection {
  return async (name) => describeCollection(connection, name);
}

export async function describeCollection(
  connection: DatabaseConnection,
  name: string,
): Promise<AuthorizationCollection | undefined> {
  const definition = await connection.collections.get(name);
  if (!definition) return undefined;
  // A relation is governed by a Policy's `relations`, never by a field list.
  const fields = (definition.fields ?? [])
    .filter((field) => !relationTypes.has(field.type))
    .map((field) => field.name);
  const physical = await connection.collections.getPhysical(name);
  const column = physical?.primaryKey?.columns[0];
  const primary = definition.constraints?.find(
    (constraint) => constraint.type === 'primary',
  );
  const primaryKey = primary?.fields[0] ?? column ?? 'id';
  const schema = physical?.columns.find(
    (candidate) => candidate.columnName === (column ?? primaryKey),
  );
  return {
    name,
    fields,
    primaryKey,
    generatedPrimaryKey:
      schema !== undefined &&
      (schema.autoIncrement ||
        schema.default !== undefined ||
        schema.generated !== undefined),
  };
}

/** The Collections an application can grant on: whatever db reports. */
export async function listCollectionNames(
  connection: DatabaseConnection,
): Promise<readonly string[]> {
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await connection.collections.list(
      cursor === undefined ? {} : { cursor },
    );
    for (const item of page.items) names.push(item.name);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return names;
}
