import type {
  EffectRun,
  EffectRunChanges,
  EffectRunQuery,
  EffectRunStatus,
  IdleRecordQuery,
  LifecycleStore,
  NewEffectRun,
  NewTransitionEntry,
  TransitionEntry,
} from './store.js';
import type { LifecycleRecord, RecordId } from './types.js';

interface MemoryState {
  records: Map<string, Map<string, LifecycleRecord>>;
  transitions: TransitionEntry[];
  effectRuns: Map<string, EffectRun>;
  sequence: number;
}

function clone(state: MemoryState): MemoryState {
  return {
    records: new Map(
      [...state.records].map(([collection, rows]) => [
        collection,
        new Map(rows),
      ]),
    ),
    transitions: [...state.transitions],
    effectRuns: new Map(state.effectRuns),
    sequence: state.sequence,
  };
}

/**
 * A store in process memory, for tests and examples. A transaction works on a
 * copy and keeps it only when the work succeeds, so a refused transition
 * leaves nothing behind here either.
 */
export class MemoryLifecycleStore implements LifecycleStore {
  private state: MemoryState = {
    records: new Map(),
    transitions: [],
    effectRuns: new Map(),
    sequence: 0,
  };

  /** Adds a record directly, the way a create form or a seed would. */
  public insertRecord(
    collection: string,
    values: Readonly<Record<string, unknown>>,
  ): LifecycleRecord {
    const id = (values.id as RecordId | undefined) ?? this.next();
    const record = Object.freeze({ ...values, id }) as LifecycleRecord;
    this.rows(collection).set(String(id), record);
    return record;
  }

  /** Changes fields outside any transition, the way an edit form would. */
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

  /** The record as it is now, read synchronously. */
  public record(collection: string, id: RecordId): LifecycleRecord | undefined {
    return this.rows(collection).get(String(id));
  }

  public async transaction<R>(
    work: (store: LifecycleStore) => Promise<R>,
  ): Promise<R> {
    const before = clone(this.state);
    try {
      return await work(this);
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  public findRecord(
    collection: string,
    id: RecordId,
  ): Promise<LifecycleRecord | undefined> {
    return Promise.resolve(this.rows(collection).get(String(id)));
  }

  public updateRecordInState(
    collection: string,
    id: RecordId,
    stateField: string,
    expected: string,
    values: Readonly<Record<string, unknown>>,
  ): Promise<boolean> {
    const current = this.rows(collection).get(String(id));
    if (!current || current[stateField] !== expected)
      return Promise.resolve(false);
    this.rows(collection).set(
      String(id),
      Object.freeze({ ...current, ...values, id: current.id }),
    );
    return Promise.resolve(true);
  }

  public findIdleRecords(
    collection: string,
    query: IdleRecordQuery,
  ): Promise<LifecycleRecord[]> {
    return Promise.resolve(
      [...this.rows(collection).values()]
        .filter(
          (record) =>
            query.states.includes(String(record[query.stateField])) &&
            typeof record[query.changedAtField] === 'string' &&
            (record[query.changedAtField] as string) < query.changedBefore,
        )
        .slice(0, query.limit),
    );
  }

  public appendTransition(entry: NewTransitionEntry): Promise<TransitionEntry> {
    const saved = Object.freeze({ ...entry, id: String(this.next()) });
    this.state.transitions.push(saved);
    return Promise.resolve(saved);
  }

  public findTransition(id: string): Promise<TransitionEntry | undefined> {
    return Promise.resolve(
      this.state.transitions.find((entry) => entry.id === id),
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
    expected: EffectRunStatus,
    changes: EffectRunChanges,
  ): Promise<boolean> {
    const current = this.state.effectRuns.get(id);
    if (!current || current.status !== expected) return Promise.resolve(false);
    this.state.effectRuns.set(id, Object.freeze({ ...current, ...changes }));
    return Promise.resolve(true);
  }

  public listEffectRuns(query: EffectRunQuery): Promise<EffectRun[]> {
    const runs = [...this.state.effectRuns.values()].filter(
      (run) =>
        (query.lifecycle === undefined || run.lifecycle === query.lifecycle) &&
        (query.recordId === undefined || run.recordId === query.recordId) &&
        (query.status === undefined || run.status === query.status) &&
        (query.claimedBefore === undefined ||
          (run.claimedAt !== null && run.claimedAt < query.claimedBefore)),
    );
    return Promise.resolve(
      query.limit === undefined ? runs : runs.slice(0, query.limit),
    );
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
