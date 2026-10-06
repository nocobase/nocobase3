import type {
  DatabaseConnection,
  DatabaseManager,
  Repository,
  RepositoryFilter,
  RepositoryRecord,
  Row,
} from '@nocobase/db';
import type {
  JsonPrimitive,
  LifecycleRecord,
  RecordId,
} from '@nocobase/lifecycle';

import type { RecordAccess } from '../scenarios/services.js';

/**
 * A `bigInt` key filters as a JavaScript number, while the scenarios pass
 * ids as strings; a key that is not a safe integer is used as it is.
 */
export function key(id: RecordId): RecordId {
  if (typeof id === 'number') return id;
  const numeric = Number(id);
  return /^\d+$/.test(id) && Number.isSafeInteger(numeric) ? numeric : id;
}

/** A stored scalar as text: instants as ISO strings, anything else empty. */
export function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  )
    return String(value);
  return value instanceof Date ? value.toISOString() : '';
}

/** A row as the scenarios compare it: instants as ISO strings. */
export function plain(row: Row): LifecycleRecord {
  const values: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(row))
    values[field] = value instanceof Date ? value.toISOString() : value;
  return values as LifecycleRecord;
}

function filterOf(
  match: Readonly<Record<string, JsonPrimitive>>,
): RepositoryFilter<RepositoryRecord> {
  const filter: Record<string, JsonPrimitive> = {};
  for (const [field, value] of Object.entries(match))
    filter[field] =
      field === 'id' && (typeof value === 'string' || typeof value === 'number')
        ? key(value)
        : value;
  return filter;
}

/** Collections the lab reads whole are small; a real application pages. */
const SCAN_LIMIT = 10_000;

/**
 * Related rows over `@nocobase/db`: through the transaction's connection
 * when a transition hands one to the services, otherwise through the
 * database, for effects and read models that run outside one.
 */
export function databaseRecords(
  source: DatabaseConnection | DatabaseManager,
): RecordAccess {
  const repository = (collection: string): Repository =>
    source.repository(collection);
  return {
    get: async (collection, id) => {
      const row = await repository(collection).findOne({
        filter: { id: key(id) },
      });
      return row ? plain(row) : undefined;
    },
    list: async (collection, where) =>
      (
        await repository(collection).findMany({
          sort: (sort) => sort.field('id').asc(),
          limit: SCAN_LIMIT,
        })
      )
        .map(plain)
        .filter(where),
    find: async (collection, match) =>
      (
        await repository(collection).findMany({
          // An empty match reads every row; the Repository takes no empty filter.
          ...(Object.keys(match).length ? { filter: filterOf(match) } : {}),
          sort: (sort) => sort.field('id').asc(),
        })
      ).map(plain),
    insert: async (collection, values) =>
      plain(
        (
          await repository(collection).createOne({
            values: values as RepositoryRecord,
          })
        ).record,
      ),
    update: async (collection, id, values) => {
      await repository(collection).updateMany({
        filter: { id: key(id) },
        values: values as RepositoryRecord,
      });
    },
  };
}
