import type {
  DatabaseConnection,
  DatabaseManager,
  Repository,
  RepositoryRecord,
  Row,
} from '@nocobase/db';

import { LIFECYCLE_COLLECTIONS } from './collections.js';
import type {
  EffectRun,
  EffectRunChanges,
  EffectRunCondition,
  EffectRunQuery,
  EffectRunStatus,
  IdleRecordQuery,
  LifecycleStore,
  NewEffectRun,
  NewTransitionEntry,
  RecordCondition,
  TransitionEntry,
} from './store.js';
import type {
  JsonObject,
  JsonValue,
  LifecycleRecord,
  RecordId,
} from './types.js';

export interface RepositoryLifecycleStoreOptions {
  /** The connection holding the records and the lifecycle collections. */
  readonly connection?: string;
  /** Collection names for the log and the effect runs; see {@link LIFECYCLE_COLLECTIONS}. */
  readonly collections?: {
    readonly transitions: string;
    readonly effectRuns: string;
  };
}

interface CollectionNames {
  readonly transitions: string;
  readonly effectRuns: string;
}

type RepositoryOf = (collection: string) => Repository;

/**
 * A `bigInt` filter takes a JavaScript number, while ids travel as strings;
 * a key that is not a safe integer is used as it is.
 */
function key(id: RecordId): RecordId {
  if (typeof id === 'number') return id;
  const numeric = Number(id);
  return /^\d+$/.test(id) && Number.isSafeInteger(numeric) ? numeric : id;
}

function text(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function json<T extends JsonValue>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    // A JSON string scalar arrives already decoded.
    return value as T;
  }
}

/** Lifecycle values are JSON-shaped; the Repository encodes them per field. */
function asRow(input: Readonly<Record<string, unknown>>): RepositoryRecord {
  return input as RepositoryRecord;
}

function toTransition(row: Row): TransitionEntry {
  return {
    id: String(row.id),
    lifecycle: String(row.lifecycle),
    recordId: String(row.recordId),
    transition: String(row.transition),
    from: text(row.from),
    to: String(row.to),
    actorId: String(row.actorId),
    input: json<JsonObject>(row.input, {}),
    at: text(row.at) ?? '',
    version: Number(row.version ?? 0),
  };
}

function toEffectRun(row: Row): EffectRun {
  return {
    id: String(row.id),
    transitionId: String(row.transitionId),
    lifecycle: String(row.lifecycle),
    recordId: String(row.recordId),
    effect: String(row.effect),
    status: String(row.status) as EffectRunStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.maxAttempts),
    result: json<JsonValue>(row.result, null),
    error: text(row.error),
    createdAt: text(row.createdAt) ?? '',
    updatedAt: text(row.updatedAt) ?? '',
    claimedAt: text(row.claimedAt),
    runAfter: text(row.runAfter),
  };
}

function toRecord(row: Row): LifecycleRecord {
  const values: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(row))
    values[field] = value instanceof Date ? value.toISOString() : value;
  return Object.freeze(values) as LifecycleRecord;
}

class RepositoryLifecycleStore implements LifecycleStore {
  public constructor(
    private readonly names: CollectionNames,
    private readonly repository: RepositoryOf,
    private readonly begin: <R>(
      work: (store: LifecycleStore) => Promise<R>,
    ) => Promise<R>,
    public readonly transactionHandle?: DatabaseConnection,
  ) {}

  public transaction<R>(
    work: (store: LifecycleStore) => Promise<R>,
  ): Promise<R> {
    return this.begin(work);
  }

  public async findRecord(
    collection: string,
    id: RecordId,
  ): Promise<LifecycleRecord | undefined> {
    const row = await this.repository(collection).findOne({
      filter: { id: key(id) },
    });
    return row ? toRecord(row) : undefined;
  }

  public async createRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<LifecycleRecord> {
    const created = await this.repository(collection).createOne({
      values: asRow(values),
    });
    return toRecord(created.record);
  }

  public async updateRecordIf(
    collection: string,
    id: RecordId,
    condition: RecordCondition,
    values: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const result = await this.repository(collection).updateMany({
      // A null version filters as IS NULL, for rows written before it existed.
      filter: {
        id: key(id),
        [condition.stateField]: condition.state,
        [condition.versionField]: condition.version,
      },
      values: asRow(values),
    });
    return result.updatedCount > 0;
  }

  public async findIdleRecords(
    collection: string,
    query: IdleRecordQuery,
  ): Promise<LifecycleRecord[]> {
    const rows = await this.repository(collection).findMany({
      filter: (filter) =>
        filter.and([
          filter.or(
            query.states.map((state) =>
              filter.string(query.stateField).eq(state),
            ),
          ),
          filter.date(query.changedAtField).before(query.changedBefore),
        ]),
      sort: (sort) => sort.field(query.changedAtField).asc(),
      limit: query.limit,
    });
    return rows.map(toRecord);
  }

  public async appendTransition(
    entry: NewTransitionEntry,
  ): Promise<TransitionEntry> {
    const created = await this.repository(this.names.transitions).createOne({
      values: asRow({ ...entry }),
    });
    return toTransition(created.record);
  }

  public async findTransition(
    id: string,
  ): Promise<TransitionEntry | undefined> {
    const row = await this.repository(this.names.transitions).findOne({
      filter: { id: key(id) },
    });
    return row ? toTransition(row) : undefined;
  }

  public async listTransitions(
    lifecycle: string,
    recordId: string,
  ): Promise<TransitionEntry[]> {
    const rows = await this.repository(this.names.transitions).findMany({
      filter: { lifecycle, recordId },
      sort: (sort) => sort.field('id').asc(),
    });
    return rows.map(toTransition);
  }

  public async createEffectRun(run: NewEffectRun): Promise<EffectRun> {
    const created = await this.repository(this.names.effectRuns).createOne({
      values: asRow({
        ...run,
        transitionId: key(run.transitionId),
      }),
    });
    return toEffectRun(created.record);
  }

  public async findEffectRun(id: string): Promise<EffectRun | undefined> {
    const row = await this.repository(this.names.effectRuns).findOne({
      filter: { id: key(id) },
    });
    return row ? toEffectRun(row) : undefined;
  }

  public async updateEffectRun(
    id: string,
    condition: EffectRunCondition,
    changes: EffectRunChanges,
  ): Promise<boolean> {
    const result = await this.repository(this.names.effectRuns).updateMany({
      filter: {
        id: key(id),
        status: condition.status,
        ...(condition.attempts === undefined
          ? {}
          : { attempts: condition.attempts }),
      },
      values: asRow({ ...changes }),
    });
    return result.updatedCount > 0;
  }

  public async listEffectRuns(query: EffectRunQuery): Promise<EffectRun[]> {
    const rows = await this.repository(this.names.effectRuns).findMany({
      filter: (filter) =>
        filter.and([
          ...(query.lifecycle === undefined
            ? []
            : [filter.string('lifecycle').eq(query.lifecycle)]),
          ...(query.recordId === undefined
            ? []
            : [filter.string('recordId').eq(query.recordId)]),
          ...(query.status === undefined
            ? []
            : [filter.string('status').eq(query.status)]),
          ...(query.claimedBefore === undefined
            ? []
            : [filter.date('claimedAt').before(query.claimedBefore)]),
        ]),
      sort: (sort) => sort.field('id').asc(),
      ...(query.limit === undefined ? {} : { limit: query.limit }),
    });
    return rows.map(toEffectRun);
  }
}

/**
 * A store over `@nocobase/db` Repositories. Inside a transaction its
 * `transactionHandle` is the transaction's `DatabaseConnection`: a service
 * that reads from a guard must use it, because on SQLite the transaction
 * holds the only connection and a read elsewhere would wait for it forever. Records are read and written
 * through the lifecycle's own collection, so its field types are encoded per
 * dialect the way every other write to that collection is.
 */
export function createRepositoryLifecycleStore(
  database: DatabaseManager,
  options: RepositoryLifecycleStoreOptions = {},
): LifecycleStore {
  const name = options.connection;
  const names: CollectionNames = options.collections ?? LIFECYCLE_COLLECTIONS;
  const outer: LifecycleStore = new RepositoryLifecycleStore(
    names,
    (collection) => database.repository(collection, name),
    (work) =>
      database.transaction((connection) => {
        const inner: LifecycleStore = new RepositoryLifecycleStore(
          names,
          (collection) => connection.repository(collection),
          (nested) => nested(inner),
          connection,
        );
        return work(inner);
      }, name),
  );
  return outer;
}
