import { LifecycleError } from './errors.js';
import type {
  JsonObject,
  LifecycleActor,
  LifecycleTypes,
  OneOrMany,
  ParametersOf,
  ServicesOf,
} from './types.js';

/** What every transition callback can read. Nothing in it is mutable. */
export interface TransitionContext<T extends LifecycleTypes> {
  readonly record: T['record'];
  readonly actor: LifecycleActor;
  readonly input: JsonObject;
  readonly parameters: ParametersOf<T>;
  readonly services: ServicesOf<T>;
  readonly now: Date;
}

/** `set` also knows where the transition goes, which `route` decided. */
export interface SetContext<
  T extends LifecycleTypes,
> extends TransitionContext<T> {
  readonly from: T['state'];
  readonly to: T['state'];
}

export interface EffectContext<T extends LifecycleTypes> {
  /** The record as it is when the attempt starts. */
  readonly record: T['record'];
  readonly input: JsonObject;
  readonly transition: string;
  readonly from: T['state'];
  readonly to: T['state'];
  /** 1 on the first try. */
  readonly attempt: number;
  /** The same on every attempt of this effect run: key external calls by it. */
  readonly idempotencyKey: string;
  readonly parameters: ParametersOf<T>;
  readonly services: ServicesOf<T>;
  readonly signal: AbortSignal;
  readonly now: Date;
}

export interface EffectRetry {
  /** Tries in total, the first included. Defaults to 1. */
  readonly attempts: number;
  /** Delay before each retry. Defaults to 0. */
  readonly backoffMs?: number;
}

export interface EffectDefinition<T extends LifecycleTypes> {
  /** Stable identity stored with every effect run. */
  readonly name: string;
  readonly retry?: EffectRetry;
  /** Transition fired as the system once the effect succeeds; its input is the effect's result when that is an object. */
  readonly onSuccess?: string;
  /** Transition fired as the system once the last attempt fails; its input is `{ error }`. */
  readonly onFailure?: string;
  /** Returns a JSON value to keep with the run, or nothing. Throw to fail. */
  run(context: EffectContext<T>): unknown;
}

export interface TransitionDefinition<T extends LifecycleTypes> {
  readonly title?: string;
  readonly from: OneOrMany<T['state']>;
  /** Every state this transition can reach; more than one requires `route`. */
  readonly to: OneOrMany<T['state']>;
  /** Picks one of `to` at run time. */
  route?(context: TransitionContext<T>): T['state'];
  /** Whether this actor may fire it now. */
  guard?(context: TransitionContext<T>): boolean | Promise<boolean>;
  /** Returns a message when the input is unacceptable. */
  validate?(input: JsonObject): string | null;
  /** Other fields to write in the same transaction. */
  set?(
    context: SetContext<T>,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Run after commit. */
  readonly effects?: readonly EffectDefinition<T>[];
}

/**
 * Fires `transition` on records that have stayed in one of `when` for longer
 * than `after` milliseconds. Records are found by a query, not by a timer per
 * record, so nothing is lost when a process restarts.
 */
export interface TriggerDefinition<T extends LifecycleTypes> {
  readonly transition: string;
  readonly when: OneOrMany<T['state']>;
  after(parameters: ParametersOf<T>): number;
  /** Records handled per sweep. Defaults to 100. */
  readonly batchSize?: number;
}

export interface LifecycleDefinition<T extends LifecycleTypes> {
  /** Unique within an application; also the default collection. */
  readonly name: string;
  readonly collection?: string;
  /** Defaults to `status`. */
  readonly stateField?: string;
  /** Defaults to `statusChangedAt`. Every transition, a self-transition too, updates it. */
  readonly changedAtField?: string;
  /**
   * Defaults to `lifecycleVersion`: an integer every transition increments.
   * The conditional update checks it as well as the state, so two
   * transitions that leave the state unchanged cannot both commit.
   */
  readonly versionField?: string;
  readonly initial: T['state'];
  readonly states: readonly T['state'][];
  /** Defaults an administrator may override. They do not change the shape of the lifecycle. */
  readonly parameters?: ParametersOf<T>;
  readonly transitions: Readonly<Record<string, TransitionDefinition<T>>>;
  /** Effects run whenever a transition enters the state, whichever transition it was. */
  readonly onEnter?: Partial<
    Readonly<Record<T['state'], readonly EffectDefinition<T>[]>>
  >;
  readonly triggers?: Readonly<Record<string, TriggerDefinition<T>>>;
}

export interface LifecycleTransition<T extends LifecycleTypes> {
  readonly name: string;
  readonly title: string;
  readonly from: readonly T['state'][];
  readonly to: readonly T['state'][];
  readonly definition: TransitionDefinition<T>;
  readonly effects: readonly EffectDefinition<T>[];
}

export interface LifecycleTrigger<T extends LifecycleTypes> {
  readonly name: string;
  readonly transition: string;
  readonly when: readonly T['state'][];
  readonly batchSize: number;
  readonly definition: TriggerDefinition<T>;
}

/** A checked, normalized definition. Build one with {@link defineLifecycle}. */
export interface Lifecycle<T extends LifecycleTypes> {
  readonly name: string;
  readonly collection: string;
  readonly stateField: string;
  readonly changedAtField: string;
  readonly versionField: string;
  readonly initial: T['state'];
  readonly states: readonly T['state'][];
  readonly parameters: ParametersOf<T>;
  readonly transitions: ReadonlyMap<string, LifecycleTransition<T>>;
  readonly onEnter: ReadonlyMap<T['state'], readonly EffectDefinition<T>[]>;
  readonly triggers: ReadonlyMap<string, LifecycleTrigger<T>>;
  /** Every effect by name, from transitions and `onEnter`. */
  readonly effects: ReadonlyMap<string, EffectDefinition<T>>;
}

/** A plain description for a client: draw the state diagram, label buttons. */
export interface LifecycleDescription {
  readonly name: string;
  readonly initial: string;
  readonly states: readonly string[];
  readonly transitions: readonly {
    readonly name: string;
    readonly title: string;
    readonly from: readonly string[];
    readonly to: readonly string[];
    readonly effects: readonly string[];
  }[];
  readonly onEnter: Readonly<Record<string, readonly string[]>>;
  readonly triggers: readonly {
    readonly name: string;
    readonly transition: string;
    readonly when: readonly string[];
  }[];
}

const NAME = /^[A-Za-z][A-Za-z0-9_.:-]*$/;

function list<S>(value: OneOrMany<S>): readonly S[] {
  return Array.isArray(value) ? (value as readonly S[]) : [value as S];
}

function invalid(lifecycle: string, message: string): LifecycleError {
  return new LifecycleError(
    'INVALID_DEFINITION',
    `Lifecycle "${lifecycle}": ${message}`,
  );
}

/** Checks an effect's shape. Its transitions are checked by the lifecycle that uses it. */
export function defineEffect<T extends LifecycleTypes>(
  effect: EffectDefinition<T>,
): EffectDefinition<T> {
  if (!NAME.test(effect.name))
    throw new LifecycleError(
      'INVALID_DEFINITION',
      `Effect name "${effect.name}" is not a valid identifier.`,
    );
  const attempts = effect.retry?.attempts ?? 1;
  if (!Number.isSafeInteger(attempts) || attempts < 1)
    throw new LifecycleError(
      'INVALID_DEFINITION',
      `Effect "${effect.name}" must try at least once.`,
    );
  return Object.freeze(effect);
}

/**
 * Checks a lifecycle once, when the module is loaded, so a typo in a state or
 * a transition fails the import rather than a request.
 */
export function defineLifecycle<T extends LifecycleTypes>(
  definition: LifecycleDefinition<T>,
): Lifecycle<T> {
  const name = definition.name;
  if (!NAME.test(name)) throw invalid(name, 'the name is not an identifier.');

  const states = new Set<T['state']>();
  for (const state of definition.states) {
    if (!NAME.test(state))
      throw invalid(name, `state "${state}" is not an identifier.`);
    if (states.has(state)) throw invalid(name, `state "${state}" repeats.`);
    states.add(state);
  }
  if (!states.size) throw invalid(name, 'it declares no states.');
  const known = (state: T['state'], where: string): void => {
    if (!states.has(state))
      throw invalid(name, `${where} names unknown state "${state}".`);
  };
  known(definition.initial, 'initial');

  const effects = new Map<string, EffectDefinition<T>>();
  const collect = (effect: EffectDefinition<T>, where: string): void => {
    const existing = effects.get(effect.name);
    if (existing && existing !== effect)
      throw invalid(
        name,
        `${where} uses a second effect named "${effect.name}".`,
      );
    effects.set(effect.name, effect);
  };

  const transitions = new Map<string, LifecycleTransition<T>>();
  for (const [key, transition] of Object.entries(definition.transitions)) {
    if (!NAME.test(key))
      throw invalid(name, `transition "${key}" is not an identifier.`);
    const from = list(transition.from);
    const to = list(transition.to);
    if (!from.length || !to.length)
      throw invalid(name, `transition "${key}" needs a from and a to.`);
    for (const state of from) known(state, `transition "${key}"`);
    for (const state of to) known(state, `transition "${key}"`);
    if (to.length > 1 && !transition.route)
      throw invalid(
        name,
        `transition "${key}" can reach ${to.length} states and needs a route.`,
      );
    for (const effect of transition.effects ?? [])
      collect(effect, `transition "${key}"`);
    transitions.set(
      key,
      Object.freeze({
        name: key,
        title: transition.title ?? key,
        from,
        to,
        definition: transition,
        effects: transition.effects ?? [],
      }),
    );
  }

  const onEnter = new Map<T['state'], readonly EffectDefinition<T>[]>();
  for (const [state, entered] of Object.entries(definition.onEnter ?? {}) as [
    T['state'],
    readonly EffectDefinition<T>[] | undefined,
  ][]) {
    known(state, 'onEnter');
    for (const effect of entered ?? []) collect(effect, `onEnter.${state}`);
    onEnter.set(state, entered ?? []);
  }

  for (const effect of effects.values())
    for (const next of [effect.onSuccess, effect.onFailure])
      if (next !== undefined && !transitions.has(next))
        throw invalid(
          name,
          `effect "${effect.name}" continues with unknown transition "${next}".`,
        );

  const triggers = new Map<string, LifecycleTrigger<T>>();
  for (const [key, trigger] of Object.entries(definition.triggers ?? {})) {
    const transition = transitions.get(trigger.transition);
    if (!transition)
      throw invalid(
        name,
        `trigger "${key}" fires unknown transition "${trigger.transition}".`,
      );
    const when = list(trigger.when);
    for (const state of when) {
      known(state, `trigger "${key}"`);
      if (!transition.from.includes(state))
        throw invalid(
          name,
          `trigger "${key}" waits in "${state}", where "${trigger.transition}" cannot start.`,
        );
    }
    triggers.set(
      key,
      Object.freeze({
        name: key,
        transition: trigger.transition,
        when,
        batchSize: trigger.batchSize ?? 100,
        definition: trigger,
      }),
    );
  }

  return Object.freeze({
    name,
    collection: definition.collection ?? name,
    stateField: definition.stateField ?? 'status',
    changedAtField: definition.changedAtField ?? 'statusChangedAt',
    versionField: definition.versionField ?? 'lifecycleVersion',
    initial: definition.initial,
    states: [...states],
    parameters: Object.freeze({
      ...(definition.parameters ?? {}),
    }) as ParametersOf<T>,
    transitions,
    onEnter,
    triggers,
    effects,
  });
}

export function describeLifecycle<T extends LifecycleTypes>(
  lifecycle: Lifecycle<T>,
): LifecycleDescription {
  return {
    name: lifecycle.name,
    initial: lifecycle.initial,
    states: [...lifecycle.states],
    transitions: [...lifecycle.transitions.values()].map((transition) => ({
      name: transition.name,
      title: transition.title,
      from: [...transition.from],
      to: [...transition.to],
      effects: transition.effects.map((effect) => effect.name),
    })),
    onEnter: Object.fromEntries(
      [...lifecycle.onEnter].map(([state, effects]) => [
        state,
        effects.map((effect) => effect.name),
      ]),
    ),
    triggers: [...lifecycle.triggers.values()].map((trigger) => ({
      name: trigger.name,
      transition: trigger.transition,
      when: [...trigger.when],
    })),
  };
}
