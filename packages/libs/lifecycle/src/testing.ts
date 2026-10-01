import type { Lifecycle } from './definition.js';
import { MemoryLifecycleStore } from './memory-store.js';
import { LifecycleRuntime, type AvailableTransition } from './runtime.js';
import type { EffectRun, TransitionEntry } from './store.js';
import type {
  JsonObject,
  LifecycleActor,
  LifecycleTypes,
  ParametersOf,
  RecordId,
  ServicesOf,
} from './types.js';

export interface LifecycleTestKitOptions<T extends LifecycleTypes> {
  readonly services?: ServicesOf<T>;
  /** Overrides on top of the lifecycle's defaults. */
  readonly parameters?: Partial<ParametersOf<T>>;
  /** Where the fake clock starts. Defaults to 2026-01-01T00:00:00Z. */
  readonly now?: string | Date;
}

export interface Duration {
  readonly days?: number;
  readonly hours?: number;
  readonly minutes?: number;
  readonly seconds?: number;
}

export interface KitFireOptions {
  /** A user id or an actor. Defaults to `tester`. */
  readonly actor?: string | LifecycleActor;
}

type RecordRef = RecordId | { readonly id: RecordId };

function idOf(record: RecordRef): RecordId {
  return typeof record === 'object' ? record.id : record;
}

function actorOf(actor: string | LifecycleActor | undefined): LifecycleActor {
  if (actor === undefined) return { id: 'tester' };
  return typeof actor === 'string' ? { id: actor } : actor;
}

function millis(duration: Duration): number {
  return (
    (duration.days ?? 0) * 86_400_000 +
    (duration.hours ?? 0) * 3_600_000 +
    (duration.minutes ?? 0) * 60_000 +
    (duration.seconds ?? 0) * 1_000
  );
}

/**
 * One lifecycle on a memory store, a fake clock and an in-process
 * dispatcher, so waiting, retrying and continuing can be tested as plain
 * function calls. `fire()` returns once every effect it caused, and every
 * transition those effects fired, has finished.
 */
export class LifecycleTestKit<T extends LifecycleTypes> {
  public readonly store: MemoryLifecycleStore = new MemoryLifecycleStore();
  public readonly runtime: LifecycleRuntime;
  private clock: number;
  private readonly failures = new Map<string, number>();

  public constructor(
    private readonly lifecycle: Lifecycle<T>,
    options: LifecycleTestKitOptions<T> = {},
  ) {
    this.clock = new Date(options.now ?? '2026-01-01T00:00:00Z').getTime();
    this.runtime = new LifecycleRuntime({
      store: this.store,
      clock: (): Date => new Date(this.clock),
      beforeEffect: (effect: string): void => {
        const remaining = this.failures.get(effect) ?? 0;
        if (remaining > 0) {
          this.failures.set(effect, remaining - 1);
          throw new Error(`Simulated failure of "${effect}".`);
        }
      },
    });
    const overrides = options.parameters ?? {};
    this.runtime.register(lifecycle, {
      ...(options.services === undefined ? {} : { services: options.services }),
      parameters: (): Partial<ParametersOf<T>> => overrides,
    });
  }

  public now(): Date {
    return new Date(this.clock);
  }

  public advance(duration: Duration): void {
    this.clock += millis(duration);
  }

  /** Creates a record in the initial state, as a create form would. */
  public create(values: Readonly<Record<string, unknown>> = {}): T['record'] {
    return this.store.insertRecord(this.lifecycle.collection, {
      ...values,
      [this.lifecycle.stateField]: this.lifecycle.initial,
      [this.lifecycle.changedAtField]: this.now().toISOString(),
    });
  }

  public get(record: RecordRef): T['record'] {
    const current = this.store.record(this.lifecycle.collection, idOf(record));
    if (!current)
      throw new Error(
        `No ${this.lifecycle.collection} record "${String(idOf(record))}".`,
      );
    return current;
  }

  /** Changes fields outside any transition, as an edit form would. */
  public update(
    record: RecordRef,
    values: Readonly<Record<string, unknown>>,
  ): T['record'] {
    return this.store.patchRecord(
      this.lifecycle.collection,
      idOf(record),
      values,
    );
  }

  /** Fires a transition and returns the record once everything it caused has settled. */
  public async fire(
    record: RecordRef,
    transition: string,
    input: JsonObject = {},
    options: KitFireOptions = {},
  ): Promise<T['record']> {
    await this.runtime.fire(this.lifecycle.name, idOf(record), transition, {
      actor: actorOf(options.actor),
      input,
    });
    return this.get(record);
  }

  public available(
    record: RecordRef,
    actor?: string | LifecycleActor,
  ): Promise<AvailableTransition[]> {
    return this.runtime.available(
      this.lifecycle.name,
      idOf(record),
      actorOf(actor),
    );
  }

  public runTriggers(): Promise<number> {
    return this.runtime.runTriggers();
  }

  /** Makes the next `times` attempts of `effect` throw. */
  public failEffect(effect: string, options: { readonly times: number }): void {
    this.failures.set(effect, options.times);
  }

  /** The names of the transitions fired on the record, oldest first. */
  public async history(record: RecordRef): Promise<string[]> {
    return (await this.transitions(record)).map((entry) => entry.transition);
  }

  public async transitions(record: RecordRef): Promise<TransitionEntry[]> {
    return [
      ...(await this.runtime.history(this.lifecycle.name, idOf(record)))
        .transitions,
    ];
  }

  /** The names of the effects the record's transitions owed, oldest first. */
  public async effects(record: RecordRef): Promise<string[]> {
    return (await this.effectRuns(record)).map((run) => run.effect);
  }

  public async effectRuns(record: RecordRef): Promise<EffectRun[]> {
    return [
      ...(await this.runtime.history(this.lifecycle.name, idOf(record)))
        .effectRuns,
    ];
  }
}

export function createLifecycleTestKit<T extends LifecycleTypes>(
  lifecycle: Lifecycle<T>,
  options: LifecycleTestKitOptions<T> = {},
): LifecycleTestKit<T> {
  return new LifecycleTestKit(lifecycle, options);
}
