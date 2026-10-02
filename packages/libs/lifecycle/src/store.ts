import type {
  JsonObject,
  JsonValue,
  LifecycleRecord,
  RecordId,
} from './types.js';

/** One fired transition: the audit trail, and the answer to "how did it get here". */
export interface TransitionEntry {
  readonly id: string;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly transition: string;
  /** Null on the entry `runtime.create()` writes: the record came from nothing. */
  readonly from: string | null;
  readonly to: string;
  readonly actorId: string;
  readonly input: JsonObject;
  readonly at: string;
  /**
   * The record's version after this transition. Unique per record, so a
   * store with a unique index refuses a second entry for the same version
   * even if a conditional update were ever bypassed.
   */
  readonly version: number;
  /**
   * The caller's key for this request, unique per record when present: the
   * same submission sent twice finds this entry instead of firing again.
   */
  readonly requestId: string | null;
}

/**
 * `dead` is a run whose attempts all ended without a result, because the
 * process running them stopped. It continues with nothing: someone looks at
 * it and retries it or gives up.
 */
export type EffectRunStatus =
  'queued' | 'running' | 'succeeded' | 'failed' | 'dead' | 'cancelled';

/**
 * One effect a transition owes. It is written in the same transaction as the
 * transition, so a committed transition never loses its effects; dispatching
 * it is a separate, repeatable step.
 */
export interface EffectRun {
  readonly id: string;
  readonly transitionId: string;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly effect: string;
  readonly status: EffectRunStatus;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly result: JsonValue;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** When the current attempt started; a stale one is reclaimed by `recover()`. */
  readonly claimedAt: string | null;
  /** Earliest time a queued run may start, for a retry with backoff. */
  readonly runAfter: string | null;
}

export type NewTransitionEntry = Omit<TransitionEntry, 'id'>;
export type NewEffectRun = Omit<EffectRun, 'id'>;
export type EffectRunChanges = Partial<
  Omit<EffectRun, 'id' | 'transitionId' | 'lifecycle' | 'recordId' | 'effect'>
>;

/**
 * What a record must still be for a transition to write it. The version is
 * what makes a self-transition safe: the state alone would not change.
 */
export interface RecordCondition {
  readonly stateField: string;
  readonly state: string;
  readonly versionField: string;
  /** Null matches a record written before it had a version. */
  readonly version: number | null;
}

/**
 * What an effect run must still be for a write to it. `attempts` fences an
 * attempt: once `recover()` takes a run back and another worker claims it,
 * the first worker's writes no longer match and are dropped.
 */
export interface EffectRunCondition {
  readonly status: EffectRunStatus;
  readonly attempts?: number;
}

export interface EffectRunQuery {
  readonly lifecycle?: string;
  readonly recordId?: string;
  readonly effect?: string;
  readonly status?: EffectRunStatus;
  readonly claimedBefore?: string;
  readonly limit?: number;
}

/** Which finished runs `deleteEffectRuns` removes. */
export interface EffectRunPruneQuery {
  readonly statuses: readonly EffectRunStatus[];
  /** Runs last changed before this instant. */
  readonly updatedBefore: string;
}

export interface IdleRecordQuery {
  readonly stateField: string;
  readonly states: readonly string[];
  readonly changedAtField: string;
  readonly changedBefore: string;
  readonly limit: number;
}

/**
 * Everything the runtime persists. Two implementations ship: one over
 * `@nocobase/db` Repositories and one in memory for tests. Each method is a
 * single statement, so an implementation needs nothing beyond ordinary reads,
 * inserts and conditional updates — which every supported dialect has.
 */
export interface LifecycleStore {
  /**
   * What a transaction runs on, such as a `@nocobase/db` connection, for
   * services that read other collections from a guard. Absent outside a
   * transaction and in stores that have none.
   */
  readonly transactionHandle?: unknown;
  /** Runs `work` in one transaction; inside it, `store` is that transaction. */
  transaction<R>(work: (store: LifecycleStore) => Promise<R>): Promise<R>;

  findRecord(
    collection: string,
    id: RecordId,
  ): Promise<LifecycleRecord | undefined>;
  /** Inserts a record and returns it as stored, its id included. */
  createRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<LifecycleRecord>;
  /**
   * Writes `values` only while the record still matches `condition`.
   * Returns whether it did: the condition is what makes two concurrent
   * transitions of one record safe without a lock.
   */
  updateRecordIf(
    collection: string,
    id: RecordId,
    condition: RecordCondition,
    values: Readonly<Record<string, unknown>>,
  ): Promise<boolean>;
  findIdleRecords(
    collection: string,
    query: IdleRecordQuery,
  ): Promise<LifecycleRecord[]>;

  appendTransition(entry: NewTransitionEntry): Promise<TransitionEntry>;
  findTransition(id: string): Promise<TransitionEntry | undefined>;
  /** The entry a request already wrote on a record, if it did. */
  findTransitionByRequest(
    lifecycle: string,
    recordId: string,
    requestId: string,
  ): Promise<TransitionEntry | undefined>;
  /** Oldest first. */
  listTransitions(
    lifecycle: string,
    recordId: string,
  ): Promise<TransitionEntry[]>;

  createEffectRun(run: NewEffectRun): Promise<EffectRun>;
  findEffectRun(id: string): Promise<EffectRun | undefined>;
  /** Writes `changes` only while the run still matches `condition`; the same guard as records. */
  updateEffectRun(
    id: string,
    condition: EffectRunCondition,
    changes: EffectRunChanges,
  ): Promise<boolean>;
  /** Oldest first. */
  listEffectRuns(query: EffectRunQuery): Promise<EffectRun[]>;
  /** Removes finished runs; returns how many. */
  deleteEffectRuns(query: EffectRunPruneQuery): Promise<number>;
}
