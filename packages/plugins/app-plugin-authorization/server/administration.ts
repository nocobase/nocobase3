import type { DatabaseConnection } from '@nocobase/db';

export interface AuthorizationRecordOption {
  id: string;
  label: string;
  description?: string;
}

/** The collection metadata `databaseAuthorization` registered for a resource. */
export interface AuthorizationRecordCollection {
  name: string;
  fields: readonly string[];
}

export interface AuthorizationAdministration {
  listRecords(
    collection: string,
  ): Promise<readonly AuthorizationRecordOption[]>;
}

export interface CreateAuthorizationAdministrationOptions {
  connection?: DatabaseConnection;
  resolveCollection(name: string): AuthorizationRecordCollection | undefined;
}

/** How many records the settings pages offer to pick from. */
const RECORD_LIMIT = 100;

/**
 * Answers the record pickers on the Authorization settings pages. Only
 * collections `databaseAuthorization` knows about can be read, so a resource
 * the application never registered returns nothing rather than reaching the
 * database.
 */
export function createAuthorizationAdministration(
  options: CreateAuthorizationAdministrationOptions,
): AuthorizationAdministration {
  return {
    async listRecords(
      name: string,
    ): Promise<readonly AuthorizationRecordOption[]> {
      const { connection } = options;
      const collection = options.resolveCollection(name);
      if (!connection || !collection) return [];
      const idField = collection.fields.includes('id')
        ? 'id'
        : collection.fields[0];
      if (!idField) return [];
      // No API can tell which field a record is recognised by, so the first
      // field that reads like a name is the label.
      const labelField =
        ['title', 'name', 'orderNumber', 'username', 'email'].find((field) =>
          collection.fields.includes(field),
        ) ?? idField;
      const fields = idField === labelField ? [idField] : [idField, labelField];
      const rows = await connection
        .repository(collectionName(collection.name))
        .findMany({
          select: (select) => select.fields(...fields),
          limit: RECORD_LIMIT,
        });
      return rows.map((row) => ({
        id: text(Reflect.get(row, idField)),
        label: text(Reflect.get(row, labelField)),
        ...(labelField === idField
          ? {}
          : { description: text(Reflect.get(row, idField)) }),
      }));
    },
  };
}

/** A picker shows text, and a column holds whatever its type is. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return '';
}

/** Resources are registered as `<source>.<collection>`; a Repository takes the collection. */
function collectionName(resourceName: string): string {
  const separator = resourceName.indexOf('.');
  return separator === -1 ? resourceName : resourceName.slice(separator + 1);
}
