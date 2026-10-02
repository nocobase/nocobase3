import { LifecycleError, type InputProblem } from './errors.js';
import type { TransitionEntry } from './store.js';
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

/**
 * What `onTransition` sees: the record as this transition wrote it, the log
 * entry, and the transaction the write is part of.
 */
export interface TransitionHookContext<T extends LifecycleTypes> {
  readonly record: T['record'];
  /** The record as it was before this transition. */
  readonly previous: T['record'];
  readonly actor: LifecycleActor;
  readonly input: JsonObject;
  readonly from: T['state'];
  readonly to: T['state'];
  readonly entry: TransitionEntry;
  readonly parameters: ParametersOf<T>;
  /** Built from the transaction's handle, as a guard's are. */
  readonly services: ServicesOf<T>;
  /** The store's transaction, such as a `@nocobase/db` connection. */
  readonly transactionHandle: unknown;
  readonly now: Date;
}

export interface EffectContext<T extends LifecycleTypes> {
  /** The record as it is when the attempt starts. */
  readonly record: T['record'];
  readonly input: JsonObject;
  readonly transition: string;
  /** Null for the entry `runtime.create()` writes. */
  readonly from: T['state'] | null;
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

/** A state with what a page needs to show it. A bare name is a state with none of this. */
export interface StateDefinition<S extends string> {
  readonly name: S;
  /** Defaults to the name. */
  readonly title?: string;
  /** No transition leaves a final state, and only a final state may have none. */
  readonly final?: boolean;
  /** Anything a page or a diagram wants: a colour, an icon. */
  readonly meta?: JsonObject;
}

/**
 * Where a transition may start: one state, several, `'*'` for every state
 * that is not final, or every such state but some.
 */
export type FromStates<S extends string> =
  OneOrMany<S> | '*' | { readonly except: readonly S[] };

/** What a guard answers: `true` to allow, anything else to refuse and say why. */
export type GuardVerdict =
  boolean | string | { readonly code?: string; readonly message: string };

export interface TransitionDefinition<T extends LifecycleTypes> {
  readonly title?: string;
  readonly from: FromStates<T['state']>;
  /** Every state this transition can reach; more than one requires `route`. */
  readonly to: OneOrMany<T['state']>;
  /** Picks one of `to` at run time. */
  route?(context: TransitionContext<T>): T['state'];
  /**
   * Whether this actor may fire it now. `true` allows it; `false`, a
   * message, or `{ code, message }` refuses it, and the message is what
   * `available()` and the refusal tell the person.
   */
  guard?(context: TransitionContext<T>): GuardVerdict | Promise<GuardVerdict>;
  /** Returns what is wrong with the input: a message, a list of problems, or nothing. */
  validate?(input: JsonObject): string | readonly InputProblem[] | null;
  /**
   * Input fields copied onto the record as they are, in the same write as
   * the state; `set` runs after and wins. The lifecycle's own fields may not
   * be accepted.
   */
  readonly accept?: readonly string[];
  /** Other fields to write in the same transaction. */
  set?(
    context: SetContext<T>,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;
  /**
   * Runs inside the transition's transaction, after the record and its log
   * entry are written: write related rows that must commit with the state,
   * or throw to refuse the transition and roll everything back. Nothing that
   * reaches outside the database belongs here; that is an effect.
   */
  onTransition?(context: TransitionHookContext<T>): void | Promise<void>;
  /** Run after commit. */
  readonly effects?: readonly EffectDefinition<T>[];
  /** Anything a page wants for its button: a tone, whether to confirm. */
  readonly meta?: JsonObject;
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
  /**
   * The state `runtime.create()` starts a record in. Several are allowed; the
   * first is the default and the others must be asked for.
   */
  readonly initial: OneOrMany<T['state']>;
  /** Names, or definitions with a title, `final` and `meta`. */
  readonly states: readonly (T['state'] | StateDefinition<T['state']>)[];
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
  readonly meta: JsonObject;
}

export interface LifecycleState<S extends string> {
  readonly name: S;
  readonly title: string;
  readonly final: boolean;
  readonly meta: JsonObject;
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
  /** The default initial state. */
  readonly initial: T['state'];
  /** Every state a record may be created in, the default first. */
  readonly initialStates: readonly T['state'][];
  readonly states: readonly T['state'][];
  /** Each state's title, whether it is final, and its metadata. */
  readonly stateInfo: ReadonlyMap<T['state'], LifecycleState<T['state']>>;
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
  readonly initialStates: readonly string[];
  readonly states: readonly string[];
  readonly stateInfo: readonly LifecycleState<string>[];
  readonly transitions: readonly {
    readonly name: string;
    readonly title: string;
    readonly from: readonly string[];
    readonly to: readonly string[];
    readonly effects: readonly string[];
    readonly accept: readonly string[];
    readonly meta: JsonObject;
  }[];
  /** Each effect's continuation transitions, for a diagram. */
  readonly continuations: readonly {
    readonly effect: string;
    readonly onSuccess?: string;
    readonly onFailure?: string;
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
  const stateInfo = new Map<T['state'], LifecycleState<T['state']>>();
  for (const entry of definition.states) {
    const state: StateDefinition<T['state']> =
      typeof entry === 'string' ? { name: entry } : entry;
    if (!NAME.test(state.name))
      throw invalid(name, `state "${state.name}" is not an identifier.`);
    if (states.has(state.name))
      throw invalid(name, `state "${state.name}" repeats.`);
    states.add(state.name);
    stateInfo.set(
      state.name,
      Object.freeze({
        name: state.name,
        title: state.title ?? state.name,
        final: state.final === true,
        meta: Object.freeze({ ...(state.meta ?? {}) }),
      }),
    );
  }
  const open = [...states].filter((state) => !stateInfo.get(state)?.final);
  if (!states.size) throw invalid(name, 'it declares no states.');
  const known = (state: T['state'], where: string): void => {
    if (!states.has(state))
      throw invalid(name, `${where} names unknown state "${state}".`);
  };
  const initialStates = list(definition.initial);
  if (!initialStates.length)
    throw invalid(name, 'it declares no initial state.');
  for (const state of initialStates) known(state, 'initial');
  const stateField = definition.stateField ?? 'status';
  const changedAtField = definition.changedAtField ?? 'statusChangedAt';
  const versionField = definition.versionField ?? 'lifecycleVersion';
  const owned = new Set(['id', stateField, changedAtField, versionField]);

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
    const source = transition.from;
    const excluded: readonly T['state'][] =
      typeof source === 'object' && 'except' in source ? source.except : [];
    for (const state of excluded) known(state, `transition "${key}" except`);
    const from: readonly T['state'][] =
      source === '*' || (typeof source === 'object' && 'except' in source)
        ? open.filter((state) => !excluded.includes(state))
        : list(source as OneOrMany<T['state']>);
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
    for (const field of transition.accept ?? [])
      if (owned.has(field))
        throw invalid(
          name,
          `transition "${key}" may not accept "${field}"; the lifecycle owns it.`,
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
        meta: Object.freeze({ ...(transition.meta ?? {}) }),
      }),
    );
  }

  // Every state is reached from an initial one, a final state has no way
  // out, and every other state has one: a slip in either is almost always a
  // transition someone forgot.
  const leaving = new Set<T['state']>();
  for (const transition of transitions.values())
    for (const state of transition.from) leaving.add(state);
  for (const state of states) {
    const final = stateInfo.get(state)?.final === true;
    if (final && leaving.has(state))
      throw invalid(name, `final state "${state}" has transitions leaving it.`);
    if (!final && !leaving.has(state))
      throw invalid(
        name,
        `state "${state}" has no way out; mark it final or add a transition.`,
      );
  }
  const reached = new Set<T['state']>(initialStates);
  for (let grew = true; grew;) {
    grew = false;
    for (const transition of transitions.values())
      if (transition.from.some((state) => reached.has(state)))
        for (const state of transition.to)
          if (!reached.has(state)) {
            reached.add(state);
            grew = true;
          }
  }
  for (const state of states)
    if (!reached.has(state))
      throw invalid(
        name,
        `state "${state}" cannot be reached from an initial state.`,
      );

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
    stateField,
    changedAtField,
    versionField,
    initial: initialStates[0],
    initialStates,
    states: [...states],
    stateInfo,
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
    initialStates: [...lifecycle.initialStates],
    states: [...lifecycle.states],
    stateInfo: [...lifecycle.stateInfo.values()],
    transitions: [...lifecycle.transitions.values()].map((transition) => ({
      name: transition.name,
      title: transition.title,
      from: [...transition.from],
      to: [...transition.to],
      effects: transition.effects.map((effect) => effect.name),
      accept: [...(transition.definition.accept ?? [])],
      meta: transition.meta,
    })),
    continuations: [...lifecycle.effects.values()]
      .filter((effect) => effect.onSuccess ?? effect.onFailure)
      .map((effect) => ({
        effect: effect.name,
        ...(effect.onSuccess === undefined
          ? {}
          : { onSuccess: effect.onSuccess }),
        ...(effect.onFailure === undefined
          ? {}
          : { onFailure: effect.onFailure }),
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
