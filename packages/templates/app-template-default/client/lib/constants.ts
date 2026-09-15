/**
 * Values shared across the client that must keep one identity for the whole life of the application.
 */

/**
 * The empty array to reach for wherever a collection is absent.
 *
 * An array literal is a new value every time it is evaluated, and React compares by identity: a `routes = []`
 * default parameter or a `?? []` fallback inside a `useMemo` looks like a changed dependency on every render, so
 * the memo it sits in recomputes and every consumer of its result re-renders. One shared instance is always the
 * same value, which is what makes those comparisons behave.
 *
 * It is frozen because it is shared. A caller that filled it would be filling everyone's empty array; freezing
 * turns that into a failure here, where the cause is visible, rather than a wrong collection somewhere else.
 *
 * `readonly never[]` is assignable to `readonly T[]` whatever `T` is, so one constant covers every element type.
 * Somewhere that needs an array it can add to still builds its own — this one is for the absent case.
 */
export const EMPTY_ARRAY: readonly never[] = Object.freeze([]);
