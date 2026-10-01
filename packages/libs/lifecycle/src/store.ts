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
  readonly from: string;
  readonly to: string;
  readonly actorId: string;
  readonly input: JsonObject;
  readonly at: string;
}

export type EffectRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

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

export interface EffectRunQuery {
  readonly lifecycle?: string;
  readonly recordId?: string;
  readonly status?: EffectRunStatus;
  readonly claimedBefore?: string;
  readonly limit?: number;
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
  /**
   * Writes `values` only while the record is still in `expected`. Returns
   * whether it did: the condition is what makes two concurrent transitions
   * of one record safe without a lock.
   */
  updateRecordInState(
    collection: string,
    id: RecordId,
    stateField: string,
    expected: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<boolean>;
  findIdleRecords(
    collection: string,
    query: IdleRecordQuery,
  ): Promise<LifecycleRecord[]>;

  appendTransition(entry: NewTransitionEntry): Promise<TransitionEntry>;
  findTransition(id: string): Promise<TransitionEntry | undefined>;
  /** Oldest first. */
  listTransitions(
    lifecycle: string,
    recordId: string,
  ): Promise<TransitionEntry[]>;

  createEffectRun(run: NewEffectRun): Promise<EffectRun>;
  findEffectRun(id: string): Promise<EffectRun | undefined>;
  /** Writes `changes` only while the run is still in `expected`; the same guard as records. */
  updateEffectRun(
    id: string,
    expected: EffectRunStatus,
    changes: EffectRunChanges,
  ): Promise<boolean>;
  /** Oldest first. */
  listEffectRuns(query: EffectRunQuery): Promise<EffectRun[]>;
}
