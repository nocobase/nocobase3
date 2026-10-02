export {
  defineEffect,
  defineLifecycle,
  describeLifecycle,
  type EffectContext,
  type EffectDefinition,
  type EffectRetry,
  type GuardVerdict,
  type Lifecycle,
  type LifecycleDefinition,
  type LifecycleDescription,
  type LifecycleTransition,
  type LifecycleTrigger,
  type SetContext,
  type TransitionContext,
  type TransitionDefinition,
  type TriggerDefinition,
} from './definition.js';
export {
  LifecycleError,
  type Blocker,
  type InputProblem,
  type LifecycleErrorCode,
  type LifecycleErrorDetails,
} from './errors.js';
export {
  guardBlockers,
  planTransition,
  stateOf,
  transitionsFrom,
  versionOf,
  type ExtraGuard,
  type PlanContext,
  type TransitionPlan,
} from './plan.js';
export {
  CREATE_TRANSITION,
  LifecycleRuntime,
  type AvailableTransition,
  type CreateOptions,
  type EffectDispatcher,
  type FireExpectation,
  type FireOptions,
  type FireResult,
  type LifecycleLogger,
  type LifecycleRuntimeOptions,
  type RecordHistory,
  type RegisterOptions,
  type ServicesSource,
  type TransitionCheck,
} from './runtime.js';
export type {
  EffectRun,
  EffectRunChanges,
  EffectRunCondition,
  EffectRunQuery,
  EffectRunStatus,
  IdleRecordQuery,
  LifecycleStore,
  NewEffectRun,
  NewTransitionEntry,
  RecordCondition,
  TransitionEntry,
} from './store.js';
export { MemoryLifecycleStore } from './memory-store.js';
export { LIFECYCLE_COLLECTIONS } from './collections.js';
export {
  createRepositoryLifecycleStore,
  type RepositoryLifecycleStoreOptions,
} from './repository-store.js';
export {
  SYSTEM_ACTOR,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleTypes,
  type OneOrMany,
  type ParametersOf,
  type RecordId,
  type ServicesOf,
} from './types.js';
