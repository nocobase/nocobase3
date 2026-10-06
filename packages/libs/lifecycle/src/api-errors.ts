import type {
  Blocker,
  InputProblem,
  LifecycleError,
  LifecycleErrorCode,
} from './errors.js';

/** The standard error statuses a lifecycle refusal answers with. */
export type LifecycleApiStatus =
  | 'INVALID_ARGUMENT'
  | 'FAILED_PRECONDITION'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'ABORTED';

export interface LifecycleApiFieldViolation {
  readonly field: string;
  readonly description: string;
}

/**
 * A refusal as the fields of an application's standard error body, for a
 * plugin to complete with its own domain:
 * `new ApiError({ ...fields, domain: 'orders' })` from
 * `@nocobase/app-server/router`. `reason` is the lifecycle's code, and
 * `metadata` carries the guards' blockers and the input problems, which a
 * page shows.
 */
export interface LifecycleApiErrorFields {
  readonly status: LifecycleApiStatus;
  readonly reason: LifecycleErrorCode;
  readonly message: string;
  readonly fieldViolations?: readonly LifecycleApiFieldViolation[];
  readonly metadata: {
    readonly blockers: readonly Blocker[];
    readonly problems: readonly InputProblem[];
  };
}

export interface LifecycleApiErrorOptions {
  /**
   * Where the transition's input sits in the request body, such as `input`
   * for `{ transition, input }`, so a problem with `line` is reported on
   * `input.line`. Defaults to the body itself, as for a creation's values.
   */
  readonly inputField?: string;
}

const STATUSES: Readonly<
  Partial<Record<LifecycleErrorCode, LifecycleApiStatus>>
> = Object.freeze({
  UNKNOWN_LIFECYCLE: 'NOT_FOUND',
  RECORD_NOT_FOUND: 'NOT_FOUND',
  // The transition is named in the body, not in the URL.
  UNKNOWN_TRANSITION: 'INVALID_ARGUMENT',
  INVALID_INPUT: 'INVALID_ARGUMENT',
  REQUEST_REUSED: 'INVALID_ARGUMENT',
  GUARD_REJECTED: 'PERMISSION_DENIED',
  INVALID_STATE: 'FAILED_PRECONDITION',
  UNKNOWN_EFFECT: 'FAILED_PRECONDITION',
  RUN_SETTLED: 'FAILED_PRECONDITION',
  CONFLICT: 'ABORTED',
});

/**
 * The standard error fields for a refusal the caller can act on, or
 * `undefined` for one that is the server's own fault — a broken definition,
 * a `route` or `set` that wrote what it may not — which the application
 * answers as an opaque `500` when the plugin rethrows it.
 *
 * | Code                                                    | Status                |
 * | ------------------------------------------------------- | --------------------- |
 * | `UNKNOWN_LIFECYCLE`, `RECORD_NOT_FOUND`                 | `NOT_FOUND`           |
 * | `UNKNOWN_TRANSITION`, `INVALID_INPUT`, `REQUEST_REUSED` | `INVALID_ARGUMENT`    |
 * | `GUARD_REJECTED`                                        | `PERMISSION_DENIED`   |
 * | `INVALID_STATE`, `UNKNOWN_EFFECT`, `RUN_SETTLED`        | `FAILED_PRECONDITION` |
 * | `CONFLICT`                                              | `ABORTED`             |
 */
export function lifecycleErrorFields(
  error: LifecycleError,
  options: LifecycleApiErrorOptions = {},
): LifecycleApiErrorFields | undefined {
  const status = STATUSES[error.code];
  if (!status) return undefined;
  const at = (field: string): string =>
    options.inputField ? `${options.inputField}.${field}` : field;
  const violations: LifecycleApiFieldViolation[] =
    error.code === 'UNKNOWN_TRANSITION'
      ? [{ field: 'transition', description: error.message }]
      : error.code === 'REQUEST_REUSED'
        ? [{ field: 'requestId', description: error.message }]
        : error.problems.map((problem) => ({
            field: problem.field
              ? at(problem.field)
              : (options.inputField ?? ''),
            description: problem.message,
          }));
  const named = violations.filter((violation) => violation.field !== '');
  return {
    status,
    reason: error.code,
    message: error.message,
    ...(named.length ? { fieldViolations: named } : {}),
    metadata: { blockers: error.blockers, problems: error.problems },
  };
}
