import { RepositoryError } from '@nocobase/db';
import type {
  DatabaseConnection,
  Repository,
  RepositoryFilter,
  RepositoryRecord,
  Row as DatabaseRow,
} from '@nocobase/db';
import type {
  JsonPrimitive,
  LifecycleRecord,
  MemoryRows,
  RecordId,
} from '@nocobase/lifecycle';

/** A row of the approval layer: a run, a task, an event. */
export type Row = LifecycleRecord;

export type Match = Readonly<Record<string, JsonPrimitive>>;

/**
 * What the approval layer reads and writes, through the transaction a
 * transition or `runtime.transaction()` hands it. Every write is a single
 * statement a Repository can issue, and `update` is conditional: it is the
 * serialization point between two events on the same task.
 */
export interface Rows {
  insert(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<Row>;
  get(collection: string, id: RecordId): Promise<Row | undefined>;
  /** The rows whose fields equal `match`, oldest first. */
  find(collection: string, match: Match): Promise<Row[]>;
  /** Writes `values` only while the row still matches `match`. */
  update(
    collection: string,
    id: RecordId,
    match: Match,
    values: Readonly<Record<string, unknown>>,
  ): Promise<boolean>;
}

function matches(row: Row, match: Match): boolean {
  return Object.entries(match).every(([field, value]) =>
    value === null
      ? row[field] === null || row[field] === undefined
      : row[field] === value,
  );
}

function isMemory(handle: unknown): handle is MemoryRows {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    typeof (handle as Partial<MemoryRows>).insertRecord === 'function'
  );
}

function isConnection(handle: unknown): handle is DatabaseConnection {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    typeof (handle as Partial<DatabaseConnection>).repository === 'function'
  );
}

function memoryRows(memory: MemoryRows): Rows {
  return {
    insert: (collection, values) =>
      Promise.resolve(memory.insertRecord(collection, values)),
    get: (collection, id) => Promise.resolve(memory.record(collection, id)),
    find: (collection, match) =>
      Promise.resolve(
        memory.records(collection).filter((row) => matches(row, match)),
      ),
    update: (collection, id, match, values) => {
      const current = memory.record(collection, id);
      if (!current || !matches(current, match)) return Promise.resolve(false);
      memory.patchRecord(collection, id, values);
      return Promise.resolve(true);
    },
  };
}

/**
 * A `bigInt` key filters as a JavaScript number, while the layer passes ids
 * as strings; a key that is not a safe integer is used as it is.
 */
function key(id: RecordId): RecordId {
  if (typeof id === 'number') return id;
  const numeric = Number(id);
  return /^\d+$/.test(id) && Number.isSafeInteger(numeric) ? numeric : id;
}

/**
 * The layer compares instants as ISO strings and ids as strings, so a row
 * read back from the database is given the shape it was written in.
 */
function toRow(row: DatabaseRow): Row {
  const values: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(row))
    values[field] = value instanceof Date ? value.toISOString() : value;
  return Object.freeze(values) as Row;
}

/**
 * A `match` is the Repository's filter shorthand, where null matches IS
 * NULL; only an id is turned into a key.
 */
function filterOf(match: Match): RepositoryFilter<RepositoryRecord> {
  const filter: Record<string, JsonPrimitive> = {};
  for (const [field, value] of Object.entries(match))
    filter[field] =
      field === 'id' && (typeof value === 'string' || typeof value === 'number')
        ? key(value)
        : value;
  return filter;
}

function databaseRows(connection: DatabaseConnection): Rows {
  const run = async <R>(
    collection: string,
    work: (repository: Repository) => Promise<R>,
  ): Promise<R> => {
    try {
      return await work(connection.repository(collection));
    } catch (cause) {
      if (
        !(cause instanceof RepositoryError) ||
        cause.code !== 'COLLECTION_NOT_FOUND'
      )
        throw cause;
      throw new Error(
        `The approval host must migrate collection "${collection}" and provide lifecycle transition and effect-run collections to its Repository store. See @nocobase/app-plugin-approval/README.md.`,
        { cause },
      );
    }
  };
  return {
    insert: (collection, values) =>
      run(collection, async (repository) =>
        toRow(
          (await repository.createOne({ values: values as RepositoryRecord }))
            .record,
        ),
      ),
    get: (collection, id) =>
      run(collection, async (repository) => {
        const row = await repository.findOne({ filter: { id: key(id) } });
        return row ? toRow(row) : undefined;
      }),
    find: (collection, match) =>
      run(collection, async (repository) =>
        (
          await repository.findMany({
            // An empty match reads every row; the Repository takes no empty filter.
            ...(Object.keys(match).length ? { filter: filterOf(match) } : {}),
            sort: (sort) => sort.field('id').asc(),
          })
        ).map(toRow),
      ),
    update: (collection, id, match, values) =>
      run(collection, async (repository) => {
        const { updatedCount } = await repository.updateMany({
          filter: filterOf({ ...match, id: key(id) }),
          values: values as RepositoryRecord,
        });
        return updatedCount > 0;
      }),
  };
}

/**
 * The rows of the transaction a lifecycle hands its hooks and
 * `runtime.transaction()` its work: a `@nocobase/db` connection when the
 * runtime runs on the Repository store, or a memory store's transaction in
 * tests. The layer writes nothing outside that transaction, so a refused
 * transition takes its tasks and events back with it.
 */
export function rowsOf(handle: unknown): Rows {
  if (isMemory(handle)) return memoryRows(handle);
  if (isConnection(handle)) return databaseRows(handle);
  throw new Error(
    'The approval layer runs inside a lifecycle transaction: pass the transaction handle of a Repository or memory store.',
  );
}
