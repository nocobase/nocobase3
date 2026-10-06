import type {
  EffectRun,
  EffectRunChanges,
  EffectRunCondition,
  EffectRunPruneQuery,
  EffectRunQuery,
  RecordCondition,
  IdleRecordQuery,
  LifecycleStore,
  NewEffectRun,
  NewTransitionEntry,
  TransitionEntry,
} from './store.js';
import type { LifecycleRecord, RecordId } from './types.js';

/** The sweep order: oldest change first, then by id, as a database index would. */
function compareIdle(
  changedAtField: string,
): (a: LifecycleRecord, b: LifecycleRecord) => number {
  return (a, b) => {
    const left = String(a[changedAtField]);
    const right = String(b[changedAtField]);
    if (left !== right) return left < right ? -1 : 1;
    return compareIds(a.id, b.id);
  };
}

function compareIds(a: RecordId, b: RecordId): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const left = String(a);
  const right = String(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

interface MemoryState {
  records: Map<string, Map<string, LifecycleRecord>>;
  transitions: TransitionEntry[];
  effectRuns: Map<string, EffectRun>;
  sequence: number;
}

/** Puts back one write of a transaction that failed. */
type Undo = () => void;

/**
 * The rows a memory store keeps, read and written without a lifecycle: what
 * a test or a second layer of state uses for rows of its own, such as tasks.
 * Inside a transaction they are written through the transaction, so a
 * rollback takes them back with the transitions they belong to.
 */
export interface MemoryRows {
  /** Adds a row, the way a create form or a seed would. */
  insertRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): LifecycleRecord;
  /** Changes fields of a row, the way an edit form would. */
  patchRecord(
    collection: string,
    id: RecordId,
    values: Readonly<Record<string, unknown>>,
  ): LifecycleRecord;
  /** The row as it is now, read synchronously. */
  record(collection: string, id: RecordId): LifecycleRecord | undefined;
  /** Every row of a collection, in the order they were added. */
  records(collection: string): LifecycleRecord[];
}

/**
 * One transaction of a {@link MemoryLifecycleStore}: the store's methods,
 * with every write remembered so a failure can take back exactly what this
 * transaction wrote. It is also the transaction's `transactionHandle`.
 */
export interface MemoryTransaction extends LifecycleStore, MemoryRows {}

/**
 * A store in process memory, for tests and examples. Transactions run one
 * after another, as a database serializes writers of one row. A transaction
 * writes in place and remembers how to undo each write, so a failure takes
 * back its own writes and nothing else — not an effect run claimed outside
 * it while it was running.
 */
export class MemoryLifecycleStore implements LifecycleStore, MemoryRows {
  private readonly state: MemoryState = {
    records: new Map(),
    transitions: [],
    effectRuns: new Map(),
    sequence: 0,
  };
  private queue: Promise<unknown> = Promise.resolve();

  public insertRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): LifecycleRecord {
    const id = (values.id as RecordId | undefined) ?? this.next();
    const record = Object.freeze({ ...values, id }) as LifecycleRecord;
    this.rows(collection).set(String(id), record);
    return record;
  }

  public patchRecord(
    collection: string,
    id: RecordId,
    values: Readonly<Record<string, unknown>>,
  ): LifecycleRecord {
    const current = this.rows(collection).get(String(id));
    if (!current) throw new Error(`No ${collection} record "${String(id)}".`);
    const record = Object.freeze({ ...current, ...values, id: current.id });
    this.rows(collection).set(String(id), record);
    return record;
  }

  public record(collection: string, id: RecordId): LifecycleRecord | undefined {
    return this.rows(collection).get(String(id));
  }

  public records(collection: string): LifecycleRecord[] {
    return [...this.rows(collection).values()];
  }

  /**
   * Runs `work` after every transaction before it. Inside, `work` receives a
   * {@link MemoryTransaction}; a transaction opened on it joins it rather
   * than waiting for itself. Opening one on the store from inside `work`
   * waits forever, as a second connection would on a locked row.
   */
  public transaction<R>(
    work: (store: LifecycleStore) => Promise<R>,
  ): Promise<R> {
    const run = this.queue.then(async () => {
      const undo: Undo[] = [];
      try {
        return await work(this.session(undo));
      } catch (error) {
        for (const step of undo.reverse()) step();
        throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  public findRecord(
    collection: string,
    id: RecordId,
  ): Promise<LifecycleRecord | undefined> {
    return Promise.resolve(this.record(collection, id));
  }

  public createRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<LifecycleRecord> {
    return Promise.resolve(this.insertRecord(collection, values));
  }

  public updateRecordIf(
    collection: string,
    id: RecordId,
    condition: RecordCondition,
    values: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const current = this.rows(collection).get(String(id));
    const version = current?.[condition.versionField] ?? null;
    if (
      !current ||
      current[condition.stateField] !== condition.state ||
      (version === null ? null : Number(version)) !== condition.version
    )
      return Promise.resolve(false);
    this.patchRecord(collection, id, values);
    return Promise.resolve(true);
  }

  public findIdleRecords(
    collection: string,
    query: IdleRecordQuery,
  ): Promise<LifecycleRecord[]> {
    const { after } = query;
    return Promise.resolve(
      [...this.rows(collection).values()]
        .filter(
          (record) =>
            query.states.includes(String(record[query.stateField])) &&
            typeof record[query.changedAtField] === 'string' &&
            (record[query.changedAtField] as string) < query.changedBefore &&
            (after === undefined ||
              (record[query.changedAtField] as string) > after.changedAt ||
              ((record[query.changedAtField] as string) === after.changedAt &&
                compareIds(record.id, after.id) > 0)),
        )
        .sort(compareIdle(query.changedAtField))
        .slice(0, query.limit),
    );
  }

  public appendTransition(entry: NewTransitionEntry): Promise<TransitionEntry> {
    // The unique index a database store declares on (lifecycle, recordId, version).
    if (
      this.state.transitions.some(
        (other) =>
          other.lifecycle === entry.lifecycle &&
          other.recordId === entry.recordId &&
          (other.version === entry.version ||
            (entry.requestId !== null && other.requestId === entry.requestId)),
      )
    )
      return Promise.reject(
        new Error(
          `Duplicate transition entry for ${entry.lifecycle}/${entry.recordId} version ${entry.version}.`,
        ),
      );
    const saved = Object.freeze({ ...entry, id: String(this.next()) });
    this.state.transitions.push(saved);
    return Promise.resolve(saved);
  }

  public findTransition(id: string): Promise<TransitionEntry | undefined> {
    return Promise.resolve(
      this.state.transitions.find((entry) => entry.id === id),
    );
  }

  public findTransitionByRequest(
    lifecycle: string,
    recordId: string,
    requestId: string,
  ): Promise<TransitionEntry | undefined> {
    return Promise.resolve(
      this.state.transitions.find(
        (entry) =>
          entry.lifecycle === lifecycle &&
          entry.recordId === recordId &&
          entry.requestId === requestId,
      ),
    );
  }

  public listTransitions(
    lifecycle: string,
    recordId: string,
  ): Promise<TransitionEntry[]> {
    return Promise.resolve(
      this.state.transitions.filter(
        (entry) => entry.lifecycle === lifecycle && entry.recordId === recordId,
      ),
    );
  }

  public createEffectRun(run: NewEffectRun): Promise<EffectRun> {
    const saved = Object.freeze({ ...run, id: String(this.next()) });
    this.state.effectRuns.set(saved.id, saved);
    return Promise.resolve(saved);
  }

  public findEffectRun(id: string): Promise<EffectRun | undefined> {
    return Promise.resolve(this.state.effectRuns.get(id));
  }

  public updateEffectRun(
    id: string,
    condition: EffectRunCondition,
    changes: EffectRunChanges,
  ): Promise<boolean> {
    const current = this.state.effectRuns.get(id);
    if (
      !current ||
      current.status !== condition.status ||
      (condition.attempts !== undefined &&
        current.attempts !== condition.attempts)
    )
      return Promise.resolve(false);
    this.state.effectRuns.set(id, Object.freeze({ ...current, ...changes }));
    return Promise.resolve(true);
  }

  public listEffectRuns(query: EffectRunQuery): Promise<EffectRun[]> {
    const runs = [...this.state.effectRuns.values()].filter(
      (run) =>
        (query.lifecycle === undefined || run.lifecycle === query.lifecycle) &&
        (query.recordId === undefined || run.recordId === query.recordId) &&
        (query.effect === undefined || run.effect === query.effect) &&
        (query.status === undefined || run.status === query.status) &&
        (query.claimedBefore === undefined ||
          (run.claimedAt !== null && run.claimedAt < query.claimedBefore)) &&
        (query.updatedBefore === undefined ||
          run.updatedAt < query.updatedBefore),
    );
    return Promise.resolve(
      query.limit === undefined ? runs : runs.slice(0, query.limit),
    );
  }

  public deleteEffectRuns(query: EffectRunPruneQuery): Promise<number> {
    return Promise.resolve(this.pruneRuns(query).length);
  }

  /**
   * The transaction `work` runs on: every read goes to the store, and every
   * write goes through the store's own methods — so a subclass that
   * overrides one sees it — and leaves a step that takes it back.
   */
  private session(undo: Undo[]): MemoryTransaction {
    const rows = (collection: string): Map<string, LifecycleRecord> =>
      this.rows(collection);
    const restore =
      (collection: string, id: RecordId, previous?: LifecycleRecord): Undo =>
      () => {
        if (previous) rows(collection).set(String(id), previous);
        else rows(collection).delete(String(id));
      };
    const restoreRun =
      (id: string, previous?: EffectRun): Undo =>
      () => {
        if (previous) this.state.effectRuns.set(id, previous);
        else this.state.effectRuns.delete(id);
      };
    const session: MemoryTransaction = {
      get transactionHandle(): MemoryTransaction {
        return session;
      },
      transaction: <R>(work: (store: LifecycleStore) => Promise<R>) =>
        work(session),
      insertRecord: (collection, values) => {
        const record = this.insertRecord(collection, values);
        undo.push(restore(collection, record.id));
        return record;
      },
      patchRecord: (collection, id, values) => {
        const previous = this.record(collection, id);
        const record = this.patchRecord(collection, id, values);
        undo.push(restore(collection, id, previous));
        return record;
      },
      record: (collection, id) => this.record(collection, id),
      records: (collection) => this.records(collection),
      findRecord: (collection, id) => this.findRecord(collection, id),
      createRecord: (collection, values) =>
        Promise.resolve(session.insertRecord(collection, values)),
      updateRecordIf: async (collection, id, condition, values) => {
        const previous = this.record(collection, id);
        const written = await this.updateRecordIf(
          collection,
          id,
          condition,
          values,
        );
        if (written) undo.push(restore(collection, id, previous));
        return written;
      },
      findIdleRecords: (collection, query) =>
        this.findIdleRecords(collection, query),
      appendTransition: async (entry) => {
        const saved = await this.appendTransition(entry);
        undo.push(() => {
          const index = this.state.transitions.indexOf(saved);
          if (index >= 0) this.state.transitions.splice(index, 1);
        });
        return saved;
      },
      findTransition: (id) => this.findTransition(id),
      findTransitionByRequest: (lifecycle, recordId, requestId) =>
        this.findTransitionByRequest(lifecycle, recordId, requestId),
      listTransitions: (lifecycle, recordId) =>
        this.listTransitions(lifecycle, recordId),
      createEffectRun: async (run) => {
        const saved = await this.createEffectRun(run);
        undo.push(restoreRun(saved.id));
        return saved;
      },
      findEffectRun: (id) => this.findEffectRun(id),
      updateEffectRun: async (id, condition, changes) => {
        const previous = this.state.effectRuns.get(id);
        const written = await this.updateEffectRun(id, condition, changes);
        if (written) undo.push(restoreRun(id, previous));
        return written;
      },
      listEffectRuns: (query) => this.listEffectRuns(query),
      deleteEffectRuns: (query) => {
        const removed = this.pruneRuns(query);
        undo.push(() => {
          for (const run of removed) this.state.effectRuns.set(run.id, run);
        });
        return Promise.resolve(removed.length);
      },
    };
    return session;
  }

  private pruneRuns(query: EffectRunPruneQuery): EffectRun[] {
    const removed: EffectRun[] = [];
    for (const [id, run] of this.state.effectRuns)
      if (
        query.statuses.includes(run.status) &&
        run.updatedAt < query.updatedBefore
      ) {
        this.state.effectRuns.delete(id);
        removed.push(run);
      }
    return removed;
  }

  private rows(collection: string): Map<string, LifecycleRecord> {
    let rows = this.state.records.get(collection);
    if (!rows) {
      rows = new Map();
      this.state.records.set(collection, rows);
    }
    return rows;
  }

  private next(): number {
    this.state.sequence += 1;
    return this.state.sequence;
  }
}
