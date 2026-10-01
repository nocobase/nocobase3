import {
  describeLifecycle,
  type Lifecycle,
  type LifecycleDescription,
} from './definition.js';
import { LifecycleError } from './errors.js';
import { planTransition, stateOf, transitionsFrom } from './plan.js';
import type { EffectRun, LifecycleStore, TransitionEntry } from './store.js';
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

export interface FireOptions {
  readonly actor: LifecycleActor;
  readonly input?: JsonObject;
}

export interface FireResult {
  /** The record as this transition committed it. */
  readonly record: LifecycleRecord;
  readonly entry: TransitionEntry;
  readonly effectRuns: readonly EffectRun[];
}

export interface AvailableTransition {
  readonly name: string;
  readonly title: string;
  readonly to: readonly string[];
  /** Whether the guard lets this actor fire it now. Input is checked only on fire. */
  readonly allowed: boolean;
}

export interface RecordHistory {
  readonly transitions: readonly TransitionEntry[];
  readonly effectRuns: readonly EffectRun[];
}

interface Registered {
  readonly lifecycle: Lifecycle<LifecycleTypes>;
  readonly services: (transactionHandle: unknown) => object;
  readonly parameters: () => object;
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
    });
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
    const { lifecycle } = registered;
    const now = this.clock();
    const parameters = this.parameters(name);
    const committed = await this.store.transaction(async (store) => {
      const current = await store.findRecord(lifecycle.collection, id);
      if (!current)
        throw new LifecycleError(
          'RECORD_NOT_FOUND',
          `No ${lifecycle.collection} record "${String(id)}".`,
        );
      const plan = await planTransition(lifecycle, current, transition, {
        actor: options.actor,
        ...(options.input === undefined ? {} : { input: options.input }),
        parameters: parameters as ParametersOf<LifecycleTypes>,
        services: registered.services(
          store.transactionHandle,
        ) as ServicesOf<LifecycleTypes>,
        now,
      });
      const written = await store.updateRecordInState(
        lifecycle.collection,
        id,
        lifecycle.stateField,
        plan.from,
        plan.values,
      );
      if (!written)
        throw new LifecycleError(
          'CONFLICT',
          `The ${lifecycle.collection} record "${String(id)}" changed state while "${transition}" was being decided.`,
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
      });
      const effectRuns: EffectRun[] = [];
      for (const effect of plan.effects)
        effectRuns.push(
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
            createdAt: at,
            updatedAt: at,
            claimedAt: null,
            runAfter: null,
          }),
        );
      const record = Object.freeze({
        ...current,
        ...plan.values,
      }) as LifecycleRecord;
      return { record, entry, effectRuns };
    });
    for (const run of committed.effectRuns) await this.handOver(run.id, null);
    return committed;
  }

  /** The transitions the record's state allows, each with whether the guard passes for `actor`. */
  public async available(
    name: string,
    id: RecordId,
    actor: LifecycleActor,
  ): Promise<AvailableTransition[]> {
    const registered = this.get(name);
    const { lifecycle } = registered;
    const record = await this.store.findRecord(lifecycle.collection, id);
    if (!record)
      throw new LifecycleError(
        'RECORD_NOT_FOUND',
        `No ${lifecycle.collection} record "${String(id)}".`,
      );
    const context = Object.freeze({
      record,
      actor,
      input: {},
      parameters: this.parameters(name) as ParametersOf<LifecycleTypes>,
      services: registered.services(undefined) as ServicesOf<LifecycleTypes>,
      now: this.clock(),
    });
    const result: AvailableTransition[] = [];
    for (const transition of transitionsFrom(
      lifecycle,
      stateOf(lifecycle, record),
    )) {
      const definition = transition.definition;
      result.push({
        name: transition.name,
        title: transition.title,
        to: [...transition.to],
        allowed: definition.guard ? await definition.guard(context) : true,
      });
    }
    return result;
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
   * update, so two workers handed the same run execute it once.
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
    const attempt = run.attempts + 1;
    const startedAt = this.clock().toISOString();
    const claimed = await this.store.updateEffectRun(runId, 'queued', {
      status: 'running',
      attempts: attempt,
      claimedAt: startedAt,
      updatedAt: startedAt,
    });
    if (!claimed) return this.store.findEffectRun(runId);

    const { lifecycle } = registered;
    let outcome: { ok: true; result: JsonValue } | { ok: false; error: string };
    try {
      const entry = await this.store.findTransition(run.transitionId);
      const record = await this.store.findRecord(
        lifecycle.collection,
        run.recordId,
      );
      if (!entry || !record)
        throw new Error('Its transition or record no longer exists.');
      await this.beforeEffect?.(effect.name, attempt);
      const value: unknown = await effect.run({
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
        services: registered.services(undefined) as ServicesOf<LifecycleTypes>,
        signal,
        now: this.clock(),
      });
      outcome = { ok: true, result: storable(value) };
    } catch (error) {
      outcome = { ok: false, error: errorText(error) };
    }

    const finishedAt = this.clock().toISOString();
    if (outcome.ok) {
      await this.store.updateEffectRun(runId, 'running', {
        status: 'succeeded',
        result: outcome.result,
        error: null,
        claimedAt: null,
        updatedAt: finishedAt,
      });
      await this.continueWith(
        lifecycle,
        run,
        effect.onSuccess,
        isJsonObject(outcome.result) ? outcome.result : {},
      );
    } else if (attempt < run.maxAttempts) {
      const backoff = effect.retry?.backoffMs ?? 0;
      const runAfter = new Date(this.clock().getTime() + backoff).toISOString();
      await this.store.updateEffectRun(runId, 'running', {
        status: 'queued',
        error: outcome.error,
        claimedAt: null,
        runAfter,
        updatedAt: finishedAt,
      });
      await this.handOver(runId, runAfter);
    } else {
      await this.store.updateEffectRun(runId, 'running', {
        status: 'failed',
        error: outcome.error,
        claimedAt: null,
        updatedAt: finishedAt,
      });
      this.logger.warn(
        `Effect "${effect.name}" failed after ${attempt} attempt(s)`,
        { runId, error: outcome.error },
      );
      await this.continueWith(lifecycle, run, effect.onFailure, {
        error: outcome.error,
      });
    }
    return this.store.findEffectRun(runId);
  }

  /**
   * Fires every trigger whose records have waited long enough. Run it on a
   * schedule; it is safe to run on several instances at once, because each
   * transition is a conditional update and a record moved by one sweep is
   * refused by the other.
   */
  public async runTriggers(): Promise<number> {
    let fired = 0;
    for (const { lifecycle } of this.lifecycles.values()) {
      const parameters = this.parameters(
        lifecycle.name,
      ) as ParametersOf<LifecycleTypes>;
      for (const trigger of lifecycle.triggers.values()) {
        const changedBefore = new Date(
          this.clock().getTime() - trigger.definition.after(parameters),
        ).toISOString();
        const records = await this.store.findIdleRecords(lifecycle.collection, {
          stateField: lifecycle.stateField,
          states: trigger.when,
          changedAtField: lifecycle.changedAtField,
          changedBefore,
          limit: trigger.batchSize,
        });
        for (const record of records) {
          try {
            await this.fire(lifecycle.name, record.id, trigger.transition, {
              actor: SYSTEM_ACTOR,
            });
            fired += 1;
          } catch (error) {
            // Another sweep or a person got there first, or the guard said
            // no: the record is no longer this trigger's business.
            if (!(error instanceof LifecycleError)) throw error;
          }
        }
      }
    }
    return fired;
  }

  /**
   * Hands over again every queued run, and takes back every attempt whose
   * process stopped answering. Call it once a process starts.
   */
  public async recover(): Promise<number> {
    const now = this.clock();
    const stale = await this.store.listEffectRuns({
      status: 'running',
      claimedBefore: new Date(now.getTime() - this.leaseMs).toISOString(),
    });
    for (const run of stale)
      await this.store.updateEffectRun(run.id, 'running', {
        status: 'queued',
        error: 'The attempt was interrupted and will run again.',
        claimedAt: null,
        updatedAt: now.toISOString(),
      });
    const queued = await this.store.listEffectRuns({ status: 'queued' });
    for (const run of queued) await this.handOver(run.id, run.runAfter);
    return queued.length;
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

  private async continueWith(
    lifecycle: Lifecycle<LifecycleTypes>,
    run: EffectRun,
    transition: string | undefined,
    input: JsonObject,
  ): Promise<void> {
    if (transition === undefined) return;
    try {
      // The next transition receives what the effect returned, or why it
      // failed, so it can record a payment reference or a failure reason.
      await this.fire(lifecycle.name, run.recordId, transition, {
        actor: SYSTEM_ACTOR,
        input,
      });
    } catch (error) {
      if (!(error instanceof LifecycleError)) throw error;
      this.logger.warn(
        `Effect "${run.effect}" could not continue with "${transition}": ${error.message}`,
        { runId: run.id },
      );
    }
  }
}
