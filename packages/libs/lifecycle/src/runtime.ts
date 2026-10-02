import {
  describeLifecycle,
  type EffectDefinition,
  type EffectRetry,
  type Lifecycle,
  type LifecycleDescription,
  type TransitionContext,
} from './definition.js';
import {
  LifecycleError,
  type Blocker,
  type LifecycleErrorCode,
} from './errors.js';
import {
  guardBlockers,
  planTransition,
  stateOf,
  transitionsFrom,
  versionOf,
  type ExtraGuard,
} from './plan.js';
import type {
  EffectRun,
  EffectRunChanges,
  EffectRunQuery,
  IdleRecordCursor,
  LifecycleStore,
  TransitionEntry,
} from './store.js';
import {
  SYSTEM_ACTOR,
  type JsonObject,
  type JsonValue,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTypes,
  type ParametersOf,
  type RecordId,
  type ServicesOf,
} from './types.js';

/**
 * Hands a queued effect run to whatever executes it. The runtime calls it
 * after a transition commits and when a retry is due; executing means calling
 * {@link LifecycleRuntime.runEffect}. A dispatch that is lost is not fatal:
 * the run stays queued and {@link LifecycleRuntime.recover} hands it over again.
 */
export interface EffectDispatcher {
  dispatch(
    runId: string,
    options: { readonly runAfter: string | null },
  ): Promise<void>;
}

export interface LifecycleLogger {
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface LifecycleRuntimeOptions {
  readonly store: LifecycleStore;
  /** Defaults to running each effect in process before `fire()` returns. */
  readonly dispatcher?: EffectDispatcher;
  readonly clock?: () => Date;
  readonly logger?: LifecycleLogger;
  /** How long an attempt may run before `recover()` takes it back. Defaults to 5 minutes. */
  readonly leaseMs?: number;
  /** Called before every attempt; a test throws from it to simulate a failure. */
  readonly beforeEffect?: (
    effect: string,
    attempt: number,
  ) => void | Promise<void>;
}

/**
 * Services, or a factory for them. The factory receives the store's
 * `transactionHandle` while a transition is decided, and `undefined`
 * elsewhere, so a guard can read through the transaction it runs in.
 */
export type ServicesSource<T extends LifecycleTypes> =
  ServicesOf<T> | ((transactionHandle: unknown) => ServicesOf<T>);

export interface RegisterOptions<T extends LifecycleTypes> {
  readonly services?: ServicesSource<T>;
  /** Administrator overrides, read on every transition so a change applies at once. */
  readonly parameters?: () => Partial<ParametersOf<T>>;
}

/**
 * What the record must still be when the transition is decided, checked
 * inside its transaction. A page passes the version it showed, so a
 * decision made on a stale screen is refused rather than applied.
 */
export interface FireExpectation {
  readonly version?: number | null;
  /** The record must have been in its state since before this instant. */
  readonly changedBefore?: string;
}

export interface FireOptions {
  readonly actor: LifecycleActor;
  readonly input?: JsonObject;
  readonly expect?: FireExpectation;
  /**
   * The caller's key for this request — a form submission, a webhook
   * delivery. Sent again for the same record, it finds the first request's
   * log entry and changes nothing.
   */
  readonly requestId?: string;
}

export interface FireResult {
  /** The record as this transition committed it, or as it is now for a replay. */
  readonly record: LifecycleRecord;
  readonly entry: TransitionEntry;
  readonly effectRuns: readonly EffectRun[];
  /** True when a request with this `requestId` had already fired. */
  readonly replayed?: boolean;
}

/** An effect run, and whether this process knows the effect it names. */
export interface EffectRunView extends EffectRun {
  /**
   * False for an effect no registered lifecycle declares: renamed or
   * removed, or known only to another process in a rolling deploy. Such a
   * run stays queued rather than being given up on.
   */
  readonly registered: boolean;
}

export interface PruneOptions {
  /** Runs last changed before this instant. */
  readonly olderThan: Date | string;
  /** Defaults to succeeded and cancelled runs. */
  readonly statuses?: readonly EffectRun['status'][];
}

export interface AvailableTransition {
  readonly name: string;
  readonly title: string;
  readonly to: readonly string[];
  /** Whether every guard lets this actor fire it now. Input is checked only on fire. */
  readonly allowed: boolean;
  /** Why not, when it is not allowed: one entry per guard that refused. */
  readonly blockers: readonly Blocker[];
}

/** The answer of `runtime.can()`: allowed, or the reasons it is not. */
export interface TransitionCheck {
  readonly allowed: boolean;
  readonly blockers: readonly Blocker[];
}

export interface CreateOptions {
  readonly actor: LifecycleActor;
  /** One of the lifecycle's initial states; the default one when absent. */
  readonly state?: string;
  /** Kept on the creation's log entry, as a transition's input is. */
  readonly input?: JsonObject;
}

/** What happened, told after it committed. */
export interface LifecycleEvent {
  readonly lifecycle: string;
  /** The transition, or `CREATE_TRANSITION` for a creation. */
  readonly transition: string;
  readonly from: string | null;
  readonly to: string;
  /** The record as the transition committed it. */
  readonly record: LifecycleRecord;
  readonly entry: TransitionEntry;
  readonly actor: LifecycleActor;
}

/** A transition the record's new state now allows, before any guard is asked. */
export interface AnnounceEvent extends LifecycleEvent {
  readonly next: string;
}

/**
 * Which events a listener hears. `transition` matches the transition that
 * committed (for `announce`, the one now allowed); `state` matches the state
 * entered.
 */
export interface EventFilter {
  readonly lifecycle?: string;
  readonly transition?: string;
  readonly state?: string;
}

export type LifecycleListener<E> = (event: E) => void | Promise<void>;

interface Subscription {
  readonly event: 'completed' | 'entered' | 'announce';
  readonly filter: EventFilter;
  readonly listener: LifecycleListener<LifecycleEvent>;
}

/** The log entry `runtime.create()` writes, so a record's history starts at its creation. */
export const CREATE_TRANSITION: string = '$create';

/**
 * Everything a page needs to show one record and its buttons: the record,
 * its state and version, what the actor may do and why not, and its history.
 */
export interface RecordView {
  readonly record: LifecycleRecord;
  readonly state: string;
  /** Pass it back as `expect.version` so a stale screen is refused. */
  readonly version: number | null;
  readonly available: readonly AvailableTransition[];
  readonly history: RecordHistory;
}

export interface RecordHistory {
  readonly transitions: readonly TransitionEntry[];
  readonly effectRuns: readonly EffectRun[];
}

interface Registered {
  readonly lifecycle: Lifecycle<LifecycleTypes>;
  readonly services: (transactionHandle: unknown) => object;
  readonly parameters: () => object;
  /** Guards added with `addGuard()`, by transition name. */
  readonly guards: Map<string, ExtraGuard<LifecycleTypes>[]>;
}

const silent: LifecycleLogger = { warn: () => {}, error: () => {} };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storable(value: unknown): JsonValue {
  const text = JSON.stringify(value === undefined ? null : value);
  if (text === undefined)
    throw new Error('An effect result must be a JSON value.');
  return JSON.parse(text) as JsonValue;
}

/** Refusals that mean the record is no longer where the caller found it. */
const MOVED_ON: ReadonlySet<LifecycleErrorCode> = new Set<LifecycleErrorCode>([
  'RECORD_NOT_FOUND',
  'INVALID_STATE',
  'GUARD_REJECTED',
]);

/** What a sweep expects when another sweep or a person got there first. */
const RACED: ReadonlySet<LifecycleErrorCode> = new Set<LifecycleErrorCode>([
  ...MOVED_ON,
  'CONFLICT',
]);

function isRefusal(
  error: unknown,
  codes: ReadonlySet<LifecycleErrorCode>,
): error is LifecycleError {
  return error instanceof LifecycleError && codes.has(error.code);
}

/** The delay before retrying after `attempt`: grows by `factor`, capped at `maxMs`. */
function backoffMs(retry: EffectRetry | undefined, attempt: number): number {
  const base = retry?.backoffMs ?? 0;
  const delay = base * (retry?.factor ?? 1) ** (attempt - 1);
  return Math.min(delay, retry?.maxMs ?? Number.POSITIVE_INFINITY);
}

class InlineDispatcher implements EffectDispatcher {
  public constructor(private readonly runtime: LifecycleRuntime) {}

  public async dispatch(runId: string): Promise<void> {
    await this.runtime.runEffect(runId);
  }
}

/**
 * Fires transitions, runs their effects and sweeps triggers for every
 * registered lifecycle. It keeps no state of its own: the store holds the
 * records, the transition log and the effect runs, so any process holding a
 * runtime over the same store can continue another one's work.
 */
export class LifecycleRuntime {
  private readonly store: LifecycleStore;
  private readonly dispatcher: EffectDispatcher;
  private readonly clock: () => Date;
  private readonly logger: LifecycleLogger;
  private readonly leaseMs: number;
  private readonly beforeEffect: LifecycleRuntimeOptions['beforeEffect'];
  private readonly lifecycles = new Map<string, Registered>();
  private readonly subscriptions: Subscription[] = [];
  /** Attempts running in this process, so `cancelRun()` can abort them. */
  private readonly attempts = new Map<string, AbortController>();

  public constructor(options: LifecycleRuntimeOptions) {
    this.store = options.store;
    this.dispatcher = options.dispatcher ?? new InlineDispatcher(this);
    this.clock = options.clock ?? ((): Date => new Date());
    this.logger = options.logger ?? silent;
    this.leaseMs = options.leaseMs ?? 5 * 60_000;
    this.beforeEffect = options.beforeEffect;
  }

  public register<T extends LifecycleTypes>(
    lifecycle: Lifecycle<T>,
    options: RegisterOptions<T> = {},
  ): void {
    if (this.lifecycles.has(lifecycle.name))
      throw new LifecycleError(
        'INVALID_DEFINITION',
        `Lifecycle "${lifecycle.name}" is already registered.`,
      );
    const source = options.services;
    this.lifecycles.set(lifecycle.name, {
      lifecycle: lifecycle,
      services:
        typeof source === 'function' ? source : (): object => source ?? {},
      parameters: options.parameters ?? ((): object => ({})),
      guards: new Map(),
    });
  }

  /**
   * Adds a guard to transitions of a registered lifecycle from outside its
   * definition, the way another plugin would veto approvals while a budget
   * is frozen. `'*'` adds it to every transition. Its refusals join the
   * blockers of `available()`, `can()` and `fire()`. Returns a function that
   * removes it again.
   */
  public addGuard<T extends LifecycleTypes>(
    name: string,
    transitions: string | readonly string[],
    guard: ExtraGuard<T>,
  ): () => void {
    const registered = this.get(name);
    const names =
      transitions === '*'
        ? [...registered.lifecycle.transitions.keys()]
        : typeof transitions === 'string'
          ? [transitions]
          : [...transitions];
    for (const transition of names)
      if (!registered.lifecycle.transitions.has(transition))
        throw new LifecycleError(
          'UNKNOWN_TRANSITION',
          `Lifecycle "${name}" has no transition "${transition}".`,
        );
    const added = guard as unknown as ExtraGuard<LifecycleTypes>;
    for (const transition of names) {
      const list = registered.guards.get(transition) ?? [];
      list.push(added);
      registered.guards.set(transition, list);
    }
    return (): void => {
      for (const transition of names) {
        const list = registered.guards.get(transition) ?? [];
        registered.guards.set(
          transition,
          list.filter((other) => other !== added),
        );
      }
    };
  }

  public describe(name: string): LifecycleDescription {
    return describeLifecycle(this.get(name).lifecycle);
  }

  /** The defaults merged with the current overrides. */
  public parameters(name: string): object {
    const registered = this.get(name);
    return { ...registered.lifecycle.parameters, ...registered.parameters() };
  }

  /**
   * Fires one transition. The state check, the record update, the log entry
   * and the effect runs it owes are one transaction; effects are dispatched
   * only after it commits.
   */
  public async fire(
    name: string,
    id: RecordId,
    transition: string,
    options: FireOptions,
  ): Promise<FireResult> {
    const registered = this.get(name);
    const now = this.clock();
    const committed = await this.store.transaction((store) =>
      this.decide(store, registered, id, transition, options, now),
    );
    if (committed.replayed) return committed;
    await this.emit(registered, committed, options.actor);
    for (const run of committed.effectRuns) await this.handOver(run.id, null);
    return committed;
  }

  /**
   * Listens to transitions after they commit: `completed` once per
   * transition (and creation), `entered` once per state entered, and
   * `announce` once per transition the new state allows — what a to-do list
   * needs. Delivery is best effort: a listener that throws is logged and the
   * caller is not told, and nothing is delivered again after a crash, so
   * work that must happen belongs in an effect. Returns a function that
   * stops listening.
   */
  public on(
    event: 'completed' | 'entered',
    filter: EventFilter,
    listener: LifecycleListener<LifecycleEvent>,
  ): () => void;
  public on(
    event: 'announce',
    filter: EventFilter,
    listener: LifecycleListener<AnnounceEvent>,
  ): () => void;
  public on(
    event: 'completed' | 'entered' | 'announce',
    filter: EventFilter,
    listener:
      LifecycleListener<LifecycleEvent> | LifecycleListener<AnnounceEvent>,
  ): () => void {
    const subscription: Subscription = {
      event,
      filter,
      listener: listener as LifecycleListener<LifecycleEvent>,
    };
    this.subscriptions.push(subscription);
    return (): void => {
      const index = this.subscriptions.indexOf(subscription);
      if (index >= 0) this.subscriptions.splice(index, 1);
    };
  }

  /**
   * The transitions the record's state allows, each with whether `actor`
   * may fire it now and, if not, every reason why.
   */
  public async available(
    name: string,
    id: RecordId,
    actor: LifecycleActor,
  ): Promise<AvailableTransition[]> {
    const registered = this.get(name);
    const { lifecycle } = registered;
    const record = await this.require(registered, id);
    const context = this.guardContext(registered, record, actor);
    const result: AvailableTransition[] = [];
    for (const transition of transitionsFrom(
      lifecycle,
      stateOf(lifecycle, record),
    )) {
      const blockers = await guardBlockers(
        transition,
        context,
        registered.guards.get(transition.name),
      );
      result.push({
        name: transition.name,
        title: transition.title,
        to: [...transition.to],
        allowed: blockers.length === 0,
        blockers,
      });
    }
    return result;
  }

  /**
   * Whether `actor` may fire `transition` on the record now. A transition
   * the record's state does not allow is refused with a `state` blocker,
   * before any guard is asked.
   */
  public async can(
    name: string,
    id: RecordId,
    transition: string,
    actor: LifecycleActor,
  ): Promise<TransitionCheck> {
    const registered = this.get(name);
    const { lifecycle } = registered;
    const declared = lifecycle.transitions.get(transition);
    if (!declared)
      throw new LifecycleError(
        'UNKNOWN_TRANSITION',
        `Lifecycle "${name}" has no transition "${transition}".`,
      );
    const record = await this.require(registered, id);
    const state = stateOf(lifecycle, record);
    if (!declared.from.includes(state))
      return {
        allowed: false,
        blockers: [
          {
            source: 'state',
            code: 'INVALID_STATE',
            message: `"${transition}" cannot start from "${state}".`,
          },
        ],
      };
    const blockers = await guardBlockers(
      declared,
      this.guardContext(registered, record, actor),
      registered.guards.get(transition),
    );
    return { allowed: blockers.length === 0, blockers };
  }

  /**
   * Creates a record through the lifecycle: in one transaction it writes the
   * record in an initial state, a log entry from nothing, and the effect runs
   * the state's `onEnter` owes, so a record's history starts where it does.
   */
  public async create(
    name: string,
    values: Readonly<Record<string, unknown>>,
    options: CreateOptions,
  ): Promise<FireResult> {
    const registered = this.get(name);
    const { lifecycle } = registered;
    const state = options.state ?? lifecycle.initial;
    if (!lifecycle.initialStates.includes(state))
      throw new LifecycleError(
        'INVALID_STATE',
        `"${state}" is not an initial state of "${name}".`,
      );
    for (const field of [
      lifecycle.stateField,
      lifecycle.changedAtField,
      lifecycle.versionField,
    ])
      if (field in values)
        throw new LifecycleError(
          'INVALID_SET',
          `Creating a ${name} record may not set "${field}"; the lifecycle owns it.`,
        );
    const now = this.clock();
    const at = now.toISOString();
    const committed = await this.store.transaction(async (store) => {
      const record = await store.createRecord(lifecycle.collection, {
        ...values,
        [lifecycle.stateField]: state,
        [lifecycle.changedAtField]: at,
        [lifecycle.versionField]: 1,
      });
      const entry = await store.appendTransition({
        lifecycle: lifecycle.name,
        recordId: String(record.id),
        transition: CREATE_TRANSITION,
        from: null,
        to: state,
        actorId: options.actor.id,
        input: options.input ?? {},
        at,
        version: 1,
        requestId: null,
      });
      const effectRuns = await this.owe(
        store,
        lifecycle,
        entry,
        lifecycle.onEnter.get(state) ?? [],
      );
      return { record, entry, effectRuns };
    });
    await this.emit(registered, committed, options.actor);
    for (const run of committed.effectRuns) await this.handOver(run.id, null);
    return committed;
  }

  /** The names of the registered lifecycles. */
  public names(): string[] {
    return [...this.lifecycles.keys()];
  }

  /** One record with what a page shows for it; see {@link RecordView}. */
  public async view(
    name: string,
    id: RecordId,
    actor: LifecycleActor,
  ): Promise<RecordView> {
    const registered = this.get(name);
    const { lifecycle } = registered;
    const record = await this.require(registered, id);
    return {
      record,
      state: stateOf(lifecycle, record),
      version: versionOf(lifecycle, record),
      available: await this.available(name, id, actor),
      history: await this.history(name, id),
    };
  }

  public async history(name: string, id: RecordId): Promise<RecordHistory> {
    const { lifecycle } = this.get(name);
    const recordId = String(id);
    return {
      transitions: await this.store.listTransitions(lifecycle.name, recordId),
      effectRuns: await this.store.listEffectRuns({
        lifecycle: lifecycle.name,
        recordId,
      }),
    };
  }

  /**
   * Runs one attempt of a queued effect run. Claiming it is a conditional
   * update, so two workers handed the same run execute it once; every later
   * write names the attempt it belongs to, so an attempt `recover()` took
   * back cannot record a result over the attempt that replaced it.
   */
  public async runEffect(
    runId: string,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<EffectRun | undefined> {
    const run = await this.store.findEffectRun(runId);
    if (!run || run.status !== 'queued') return run;
    const registered = this.lifecycles.get(run.lifecycle);
    const effect = registered?.lifecycle.effects.get(run.effect);
    if (!registered || !effect) {
      this.logger.warn(
        `Effect run "${runId}" names "${run.lifecycle}/${run.effect}", which is not registered; it stays queued.`,
      );
      return run;
    }
    const startedAt = this.clock().toISOString();
    // Every attempt was claimed and none came back: the process running it
    // stopped each time. Running it again could stop this one too.
    if (run.attempts >= run.maxAttempts) {
      await this.store.updateEffectRun(
        runId,
        { status: 'queued', attempts: run.attempts },
        {
          status: 'dead',
          error: `None of its ${run.attempts} attempt(s) recorded an outcome; it needs a person to retry it.`,
          claimedAt: null,
          updatedAt: startedAt,
        },
      );
      this.logger.error(`Effect "${effect.name}" is dead`, { runId });
      return this.store.findEffectRun(runId);
    }
    const attempt = run.attempts + 1;
    const claimed = await this.store.updateEffectRun(
      runId,
      { status: 'queued', attempts: run.attempts },
      {
        status: 'running',
        attempts: attempt,
        claimedAt: startedAt,
        updatedAt: startedAt,
      },
    );
    if (!claimed) return this.store.findEffectRun(runId);

    const { lifecycle } = registered;
    let outcome:
      | { ok: true; result: JsonValue }
      | { ok: false; error: string; cause: unknown };
    // One controller per attempt: the caller's signal, cancelRun() and the
    // timeout all abort it.
    const controller = new AbortController();
    const forward = (): void => controller.abort(signal.reason);
    if (signal.aborted) forward();
    else signal.addEventListener('abort', forward, { once: true });
    this.attempts.set(runId, controller);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const entry = await this.store.findTransition(run.transitionId);
      const record = await this.store.findRecord(
        lifecycle.collection,
        run.recordId,
      );
      if (!entry || !record)
        throw new Error('Its transition or record no longer exists.');
      await this.beforeEffect?.(effect.name, attempt);
      const work = Promise.resolve(
        effect.run({
          record,
          input: entry.input,
          transition: entry.transition,
          from: entry.from,
          to: entry.to,
          attempt,
          idempotencyKey: `${lifecycle.name}:${runId}`,
          parameters: this.parameters(
            lifecycle.name,
          ) as ParametersOf<LifecycleTypes>,
          services: registered.services(
            undefined,
          ) as ServicesOf<LifecycleTypes>,
          signal: controller.signal,
          now: this.clock(),
        }),
      );
      const limit = effect.timeoutMs;
      const value: unknown =
        limit === undefined
          ? await work
          : await Promise.race([
              work,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  const error = new Error(`Timed out after ${limit} ms.`);
                  controller.abort(error);
                  reject(error);
                }, limit);
              }),
            ]);
      outcome = { ok: true, result: storable(value) };
    } catch (error) {
      outcome = { ok: false, error: errorText(error), cause: error };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', forward);
      this.attempts.delete(runId);
    }

    const finishedAt = this.clock().toISOString();
    if (
      !outcome.ok &&
      attempt < run.maxAttempts &&
      (effect.retry?.shouldRetry?.(outcome.cause, attempt) ?? true)
    ) {
      const runAfter = new Date(
        this.clock().getTime() + backoffMs(effect.retry, attempt),
      ).toISOString();
      const requeued = await this.store.updateEffectRun(
        runId,
        { status: 'running', attempts: attempt },
        {
          status: 'queued',
          error: outcome.error,
          claimedAt: null,
          runAfter,
          updatedAt: finishedAt,
        },
      );
      if (requeued) await this.handOver(runId, runAfter);
      else this.discarded(effect.name, runId, attempt);
      return this.store.findEffectRun(runId);
    }

    const changes: EffectRunChanges = outcome.ok
      ? {
          status: 'succeeded',
          result: outcome.result,
          error: null,
          claimedAt: null,
          updatedAt: finishedAt,
        }
      : {
          status: 'failed',
          error: outcome.error,
          claimedAt: null,
          updatedAt: finishedAt,
        };
    const next = outcome.ok ? effect.onSuccess : effect.onFailure;
    // The next transition receives what the effect returned, or why it
    // failed, so it can record a payment reference or a failure reason.
    const input: JsonObject = outcome.ok
      ? isJsonObject(outcome.result)
        ? outcome.result
        : {}
      : { error: outcome.error };
    // Recording the outcome and firing what follows it commit together: a
    // stop between the two would otherwise leave a succeeded run whose
    // record never moves on.
    let finished: FireResult | null | undefined;
    try {
      finished = await this.store.transaction(async (store) => {
        const recorded = await store.updateEffectRun(
          runId,
          { status: 'running', attempts: attempt },
          changes,
        );
        if (!recorded) return undefined;
        if (next === undefined) return null;
        try {
          return await this.decide(
            store,
            registered,
            run.recordId,
            next,
            { actor: SYSTEM_ACTOR, input },
            this.clock(),
          );
        } catch (error) {
          // The record has moved on, or the guard refuses: the outcome is
          // still recorded, and nothing follows from it. decide() writes
          // nothing before it refuses, so the transaction stays whole.
          // Anything else, a conflict included, rolls the attempt back so
          // it runs again rather than losing what should follow.
          if (!isRefusal(error, MOVED_ON)) throw error;
          this.logger.warn(
            `Effect "${run.effect}" could not continue with "${next}": ${error.message}`,
            { runId },
          );
          return null;
        }
      });
    } catch (error) {
      // Nothing of the outcome stuck. Put the attempt back in the queue now,
      // after a backoff, rather than leaving it claimed until a lease expires
      // and someone calls reclaim(); the run stays claimed only when even
      // this write fails, and then reclaim() takes it back.
      const runAfter = new Date(
        this.clock().getTime() + backoffMs(effect.retry, attempt),
      ).toISOString();
      const requeued = await this.store.updateEffectRun(
        runId,
        { status: 'running', attempts: attempt },
        {
          status: 'queued',
          error: `Its outcome could not be recorded: ${errorText(error)}`,
          claimedAt: null,
          runAfter,
          updatedAt: this.clock().toISOString(),
        },
      );
      if (!requeued) throw error;
      this.logger.warn(
        `Effect "${effect.name}" ran, but its outcome could not be recorded; attempt ${attempt} is queued again.`,
        { runId, error },
      );
      await this.handOver(runId, runAfter);
      return this.store.findEffectRun(runId);
    }
    if (finished === undefined) this.discarded(effect.name, runId, attempt);
    else if (finished) {
      await this.emit(registered, finished, SYSTEM_ACTOR);
      for (const owed of finished.effectRuns)
        await this.handOver(owed.id, null);
    }
    if (!outcome.ok)
      this.logger.warn(
        `Effect "${effect.name}" failed after ${attempt} attempt(s)`,
        { runId, error: outcome.error },
      );
    return this.store.findEffectRun(runId);
  }

  /**
   * Effect runs for an operations page: the stuck, the failed, the dead.
   * Each says whether this process knows its effect.
   */
  public async listEffectRuns(
    query: EffectRunQuery = {},
  ): Promise<EffectRunView[]> {
    const runs = await this.store.listEffectRuns(query);
    return runs.map((run) => ({
      ...run,
      registered:
        this.lifecycles
          .get(run.lifecycle)
          ?.lifecycle.effects.has(run.effect) === true,
    }));
  }

  /**
   * Runs a failed, dead or cancelled run again, with a fresh budget of
   * attempts — once whatever made it fail is fixed. Its earlier `onFailure`
   * stays fired; if it now succeeds, its `onSuccess` is refused should the
   * record have moved on. The attempt count goes on from where it was: an
   * earlier attempt still finishing somewhere cannot pass for a new one.
   */
  public async retryRun(runId: string): Promise<EffectRun | undefined> {
    const run = await this.store.findEffectRun(runId);
    if (!run) return undefined;
    if (
      run.status !== 'failed' &&
      run.status !== 'dead' &&
      run.status !== 'cancelled'
    )
      throw new LifecycleError(
        'INVALID_STATE',
        `Effect run "${runId}" is ${run.status}; only a failed, dead or cancelled run can be retried.`,
      );
    const effect = this.lifecycles
      .get(run.lifecycle)
      ?.lifecycle.effects.get(run.effect);
    if (!effect)
      throw new LifecycleError(
        'UNKNOWN_EFFECT',
        `Effect run "${runId}" names "${run.lifecycle}/${run.effect}", which is not registered here.`,
      );
    const reset = await this.store.updateEffectRun(
      runId,
      { status: run.status, attempts: run.attempts },
      {
        status: 'queued',
        maxAttempts: run.attempts + (effect.retry?.attempts ?? 1),
        error: null,
        claimedAt: null,
        runAfter: null,
        updatedAt: this.clock().toISOString(),
      },
    );
    if (reset) await this.handOver(runId, null);
    return this.store.findEffectRun(runId);
  }

  /**
   * Gives up on a queued or running run. A running attempt in this process
   * is aborted; one elsewhere finds the run cancelled when it finishes and
   * its outcome is discarded. Nothing follows from a cancelled run.
   */
  public async cancelRun(runId: string): Promise<EffectRun | undefined> {
    const run = await this.store.findEffectRun(runId);
    if (!run) return undefined;
    if (run.status !== 'queued' && run.status !== 'running')
      throw new LifecycleError(
        'INVALID_STATE',
        `Effect run "${runId}" is ${run.status}; only a queued or running run can be cancelled.`,
      );
    const cancelled = await this.store.updateEffectRun(
      runId,
      { status: run.status, attempts: run.attempts },
      {
        status: 'cancelled',
        error: 'Cancelled.',
        claimedAt: null,
        updatedAt: this.clock().toISOString(),
      },
    );
    if (cancelled)
      this.attempts.get(runId)?.abort(new Error('The run was cancelled.'));
    return this.store.findEffectRun(runId);
  }

  /** Deletes finished runs last changed before `olderThan`; returns how many. */
  public prune(options: PruneOptions): Promise<number> {
    const olderThan =
      typeof options.olderThan === 'string'
        ? options.olderThan
        : options.olderThan.toISOString();
    return this.store.deleteEffectRuns({
      statuses: options.statuses ?? ['succeeded', 'cancelled'],
      updatedBefore: olderThan,
    });
  }

  /**
   * Fires every trigger whose records have waited long enough. Run it on a
   * schedule; it is safe to run on several instances at once, because each
   * transition is a conditional update and a record moved by one sweep is
   * refused by the other. A trigger fires at most `batchSize` transitions
   * per sweep; records its guard refuses stay idle and are paged past, so
   * they cannot keep the records behind them from being reached.
   */
  public async runTriggers(): Promise<number> {
    let fired = 0;
    const failures: unknown[] = [];
    for (const { lifecycle } of this.lifecycles.values()) {
      const parameters = this.parameters(
        lifecycle.name,
      ) as ParametersOf<LifecycleTypes>;
      for (const trigger of lifecycle.triggers.values()) {
        const changedBefore = new Date(
          this.clock().getTime() - trigger.definition.after(parameters),
        ).toISOString();
        let after: IdleRecordCursor | undefined;
        let firedHere = 0;
        while (firedHere < trigger.batchSize) {
          const records = await this.store.findIdleRecords(
            lifecycle.collection,
            {
              stateField: lifecycle.stateField,
              states: trigger.when,
              changedAtField: lifecycle.changedAtField,
              changedBefore,
              limit: trigger.batchSize,
              ...(after ? { after } : {}),
            },
          );
          for (const record of records) {
            if (firedHere >= trigger.batchSize) break;
            try {
              // The record must still be idle when the transition is
              // decided: another sweep may have moved it since this one read it.
              await this.fire(lifecycle.name, record.id, trigger.transition, {
                actor: SYSTEM_ACTOR,
                expect: { changedBefore },
              });
              firedHere += 1;
            } catch (error) {
              // Another sweep or a person got there first, or the guard said
              // no: the record is no longer this trigger's business.
              if (isRefusal(error, RACED)) continue;
              // A broken definition or a failing store: keep sweeping the
              // other records, then report it rather than look idle forever.
              this.logger.error(
                `Trigger "${trigger.name}" could not fire "${trigger.transition}" on ${lifecycle.collection} record "${String(record.id)}"`,
                { error },
              );
              failures.push(error);
            }
          }
          const last = records.at(-1);
          if (records.length < trigger.batchSize || !last) break;
          const next: IdleRecordCursor = {
            changedAt: String(last[lifecycle.changedAtField]),
            id: last.id,
          };
          // A store that ignores the cursor would hand back the same page forever.
          if (
            after &&
            after.changedAt === next.changedAt &&
            after.id === next.id
          )
            break;
          after = next;
        }
        fired += firedHere;
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        `${failures.length} triggered transitions failed.`,
      );
    return fired;
  }

  /**
   * Takes back every attempt whose lease has expired — its process stopped,
   * or stalled past `leaseMs` — and hands it over again. Run it on the same
   * schedule as `runTriggers()`: a run left claimed is otherwise only noticed
   * when a process starts. Returns how many it took back.
   */
  public async reclaim(): Promise<number> {
    const taken = await this.takeBackStale();
    for (const run of taken) await this.handOver(run.id, null);
    return taken.length;
  }

  /**
   * Hands over again every queued run, and takes back every attempt whose
   * process stopped answering. Call it once a process starts.
   */
  public async recover(): Promise<number> {
    await this.takeBackStale();
    const queued = await this.store.listEffectRuns({ status: 'queued' });
    for (const run of queued) await this.handOver(run.id, run.runAfter);
    return queued.length;
  }

  private async takeBackStale(): Promise<EffectRun[]> {
    const now = this.clock();
    const stale = await this.store.listEffectRuns({
      status: 'running',
      claimedBefore: new Date(now.getTime() - this.leaseMs).toISOString(),
    });
    const taken: EffectRun[] = [];
    for (const run of stale)
      if (
        await this.store.updateEffectRun(
          run.id,
          { status: 'running', attempts: run.attempts },
          {
            status: 'queued',
            error: 'The attempt was interrupted and will run again.',
            claimedAt: null,
            updatedAt: now.toISOString(),
          },
        )
      )
        taken.push(run);
    return taken;
  }

  private get(name: string): Registered {
    const registered = this.lifecycles.get(name);
    if (!registered)
      throw new LifecycleError(
        'UNKNOWN_LIFECYCLE',
        `No lifecycle "${name}" is registered.`,
      );
    return registered;
  }

  private async handOver(
    runId: string,
    runAfter: string | null,
  ): Promise<void> {
    try {
      await this.dispatcher.dispatch(runId, { runAfter });
    } catch (error) {
      this.logger.error(
        `Effect run "${runId}" could not be dispatched; recover() will retry it.`,
        { error },
      );
    }
  }

  /**
   * Decides and writes one transition on `store`, which is a transaction.
   * Everything it checks comes before anything it writes, so a refusal
   * leaves the transaction as it found it.
   */
  private async decide(
    store: LifecycleStore,
    registered: Registered,
    id: RecordId,
    transition: string,
    options: FireOptions,
    now: Date,
  ): Promise<FireResult> {
    const { lifecycle } = registered;
    const current = await store.findRecord(lifecycle.collection, id);
    if (!current)
      throw new LifecycleError(
        'RECORD_NOT_FOUND',
        `No ${lifecycle.collection} record "${String(id)}".`,
      );
    if (options.requestId !== undefined) {
      const earlier = await store.findTransitionByRequest(
        lifecycle.name,
        String(current.id),
        options.requestId,
      );
      if (earlier)
        return {
          record: current,
          entry: earlier,
          effectRuns: [],
          replayed: true,
        };
    }
    const expected = options.expect;
    if (
      expected?.version !== undefined &&
      versionOf(lifecycle, current) !== expected.version
    )
      throw new LifecycleError(
        'CONFLICT',
        `The ${lifecycle.collection} record "${String(id)}" changed since it was read.`,
      );
    if (
      expected?.changedBefore !== undefined &&
      !(String(current[lifecycle.changedAtField]) < expected.changedBefore)
    )
      throw new LifecycleError(
        'CONFLICT',
        `The ${lifecycle.collection} record "${String(id)}" changed state after ${expected.changedBefore}.`,
      );
    const plan = await planTransition(lifecycle, current, transition, {
      actor: options.actor,
      ...(options.input === undefined ? {} : { input: options.input }),
      parameters: this.parameters(
        lifecycle.name,
      ) as ParametersOf<LifecycleTypes>,
      services: registered.services(
        store.transactionHandle,
      ) as ServicesOf<LifecycleTypes>,
      now,
      guards: registered.guards.get(transition) ?? [],
    });
    const written = await store.updateRecordIf(
      lifecycle.collection,
      id,
      {
        stateField: lifecycle.stateField,
        state: plan.from,
        versionField: lifecycle.versionField,
        version: plan.version,
      },
      plan.values,
    );
    if (!written)
      throw new LifecycleError(
        'CONFLICT',
        `The ${lifecycle.collection} record "${String(id)}" changed while "${transition}" was being decided.`,
      );
    const at = now.toISOString();
    const entry = await store.appendTransition({
      lifecycle: lifecycle.name,
      recordId: String(current.id),
      transition,
      from: plan.from,
      to: plan.to,
      actorId: options.actor.id,
      input: plan.input,
      at,
      version: plan.nextVersion,
      requestId: options.requestId ?? null,
    });
    const record = Object.freeze({
      ...current,
      ...plan.values,
    }) as LifecycleRecord;
    const definition = lifecycle.transitions.get(transition)?.definition;
    if (definition?.onTransition)
      await definition.onTransition(
        Object.freeze({
          record,
          previous: current,
          actor: options.actor,
          input: plan.input,
          from: plan.from,
          to: plan.to,
          entry,
          parameters: this.parameters(
            lifecycle.name,
          ) as ParametersOf<LifecycleTypes>,
          services: registered.services(
            store.transactionHandle,
          ) as ServicesOf<LifecycleTypes>,
          transactionHandle: store.transactionHandle,
          now,
        }),
      );
    const effectRuns = await this.owe(store, lifecycle, entry, plan.effects);
    return { record, entry, effectRuns };
  }

  /** Tells the listeners about a committed transition; a failing listener is logged, never thrown. */
  private async emit(
    registered: Registered,
    committed: FireResult,
    actor: LifecycleActor,
  ): Promise<void> {
    if (!this.subscriptions.length) return;
    const { lifecycle } = registered;
    const { entry, record } = committed;
    const base: LifecycleEvent = Object.freeze({
      lifecycle: lifecycle.name,
      transition: entry.transition,
      from: entry.from,
      to: entry.to,
      record,
      entry,
      actor,
    });
    const deliveries: [Subscription['event'], LifecycleEvent][] = [
      ['completed', base],
      ['entered', base],
      ...transitionsFrom(lifecycle, entry.to).map(
        (next): [Subscription['event'], LifecycleEvent] => [
          'announce',
          Object.freeze({ ...base, next: next.name }) as AnnounceEvent,
        ],
      ),
    ];
    for (const [event, payload] of deliveries)
      for (const subscription of [...this.subscriptions]) {
        if (subscription.event !== event) continue;
        const { filter } = subscription;
        const transition =
          event === 'announce'
            ? (payload as AnnounceEvent).next
            : payload.transition;
        if (
          (filter.lifecycle !== undefined &&
            filter.lifecycle !== payload.lifecycle) ||
          (filter.transition !== undefined &&
            filter.transition !== transition) ||
          (filter.state !== undefined && filter.state !== payload.to)
        )
          continue;
        try {
          await subscription.listener(payload);
        } catch (error) {
          this.logger.error(
            `A "${event}" listener failed on ${lifecycle.name} record "${entry.recordId}"`,
            { error },
          );
        }
      }
  }

  /** Writes a queued run for each effect a log entry owes. */
  private async owe(
    store: LifecycleStore,
    lifecycle: Lifecycle<LifecycleTypes>,
    entry: TransitionEntry,
    effects: readonly EffectDefinition<LifecycleTypes>[],
  ): Promise<EffectRun[]> {
    const runs: EffectRun[] = [];
    for (const effect of effects)
      runs.push(
        await store.createEffectRun({
          transitionId: entry.id,
          lifecycle: lifecycle.name,
          recordId: entry.recordId,
          effect: effect.name,
          status: 'queued',
          attempts: 0,
          maxAttempts: effect.retry?.attempts ?? 1,
          result: null,
          error: null,
          createdAt: entry.at,
          updatedAt: entry.at,
          claimedAt: null,
          runAfter: null,
        }),
      );
    return runs;
  }

  private async require(
    registered: Registered,
    id: RecordId,
  ): Promise<LifecycleRecord> {
    const { lifecycle } = registered;
    const record = await this.store.findRecord(lifecycle.collection, id);
    if (!record)
      throw new LifecycleError(
        'RECORD_NOT_FOUND',
        `No ${lifecycle.collection} record "${String(id)}".`,
      );
    return record;
  }

  /** What a guard sees outside a transition: no input, no transaction. */
  private guardContext(
    registered: Registered,
    record: LifecycleRecord,
    actor: LifecycleActor,
  ): TransitionContext<LifecycleTypes> {
    return Object.freeze({
      record,
      actor,
      input: {},
      parameters: this.parameters(
        registered.lifecycle.name,
      ) as ParametersOf<LifecycleTypes>,
      services: registered.services(undefined) as ServicesOf<LifecycleTypes>,
      now: this.clock(),
    });
  }

  private discarded(effect: string, runId: string, attempt: number): void {
    this.logger.warn(
      `Attempt ${attempt} of effect "${effect}" finished after recover() took it back; its outcome is discarded.`,
      { runId },
    );
  }
}
