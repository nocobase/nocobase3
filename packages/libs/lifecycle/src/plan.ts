import type {
  EffectDefinition,
  Lifecycle,
  LifecycleTransition,
  TransitionContext,
} from './definition.js';
import { LifecycleError } from './errors.js';
import type {
  JsonObject,
  LifecycleActor,
  LifecycleTypes,
  ParametersOf,
  ServicesOf,
} from './types.js';

export interface PlanContext<T extends LifecycleTypes> {
  readonly actor: LifecycleActor;
  readonly input?: JsonObject;
  readonly parameters: ParametersOf<T>;
  readonly services: ServicesOf<T>;
  readonly now: Date;
}

/** What a transition will write and run, decided without touching any store. */
export interface TransitionPlan<T extends LifecycleTypes> {
  readonly transition: string;
  readonly from: T['state'];
  readonly to: T['state'];
  /** Every field the transition writes, the state and its timestamp included. */
  readonly values: Readonly<Record<string, unknown>>;
  readonly input: JsonObject;
  readonly effects: readonly EffectDefinition<T>[];
}

export function stateOf<T extends LifecycleTypes>(
  lifecycle: Lifecycle<T>,
  record: T['record'],
): T['state'] {
  return String(record[lifecycle.stateField]);
}

/** Transitions that may start from the record's current state, before any guard. */
export function transitionsFrom<T extends LifecycleTypes>(
  lifecycle: Lifecycle<T>,
  state: T['state'],
): readonly LifecycleTransition<T>[] {
  return [...lifecycle.transitions.values()].filter((transition) =>
    transition.from.includes(state),
  );
}

/**
 * Decides one transition: state, guard, input, route and extra fields, in
 * that order. The function is pure apart from what `guard`, `route` and `set`
 * do, so a lifecycle can be tested by calling it directly.
 */
export async function planTransition<T extends LifecycleTypes>(
  lifecycle: Lifecycle<T>,
  record: T['record'],
  transitionName: string,
  context: PlanContext<T>,
): Promise<TransitionPlan<T>> {
  const transition = lifecycle.transitions.get(transitionName);
  if (!transition)
    throw new LifecycleError(
      'UNKNOWN_TRANSITION',
      `Lifecycle "${lifecycle.name}" has no transition "${transitionName}".`,
    );
  const from = stateOf(lifecycle, record);
  if (!transition.from.includes(from))
    throw new LifecycleError(
      'INVALID_STATE',
      `"${transitionName}" cannot start from "${from}".`,
    );

  const input = context.input ?? {};
  const base: TransitionContext<T> = Object.freeze({
    record,
    actor: context.actor,
    input,
    parameters: context.parameters,
    services: context.services,
    now: context.now,
  });
  const definition = transition.definition;
  if (definition.guard && !(await definition.guard(base)))
    throw new LifecycleError(
      'GUARD_REJECTED',
      `"${context.actor.id}" may not fire "${transitionName}" now.`,
    );
  const problem = definition.validate?.(input) ?? null;
  if (problem !== null) throw new LifecycleError('INVALID_INPUT', problem);

  const to = definition.route ? definition.route(base) : transition.to[0];
  if (!transition.to.includes(to))
    throw new LifecycleError(
      'INVALID_ROUTE',
      `"${transitionName}" routed to "${to}", which it does not declare.`,
    );

  const extra = definition.set
    ? await definition.set(Object.freeze({ ...base, from, to }))
    : {};
  for (const field of ['id', lifecycle.stateField, lifecycle.changedAtField])
    if (field in extra)
      throw new LifecycleError(
        'INVALID_SET',
        `"${transitionName}" may not set "${field}"; the lifecycle owns it.`,
      );

  return {
    transition: transitionName,
    from,
    to,
    input,
    values: {
      ...extra,
      [lifecycle.stateField]: to,
      [lifecycle.changedAtField]: context.now.toISOString(),
    },
    effects: [...transition.effects, ...(lifecycle.onEnter.get(to) ?? [])],
  };
}
