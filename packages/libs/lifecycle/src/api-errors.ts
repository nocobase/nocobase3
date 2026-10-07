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
  INVALID_REQUEST_ID: 'INVALID_ARGUMENT',
  // Unless every blocker is a precondition; see statusOf().
  GUARD_REJECTED: 'PERMISSION_DENIED',
  NOT_MANUAL: 'PERMISSION_DENIED',
  INVALID_STATE: 'FAILED_PRECONDITION',
  UNKNOWN_EFFECT: 'FAILED_PRECONDITION',
  RUN_SETTLED: 'FAILED_PRECONDITION',
  CONFLICT: 'ABORTED',
});

/**
 * A guard refusal is a denied permission as soon as one blocker is about who
 * asks; only a refusal every blocker of which waits for the record to change
 * is a failed precondition, which the person with the permission can clear.
 */
function statusOf(error: LifecycleError): LifecycleApiStatus | undefined {
  if (
    error.code === 'GUARD_REJECTED' &&
    error.blockers.length > 0 &&
    error.blockers.every((blocker) => blocker.kind === 'precondition')
  )
    return 'FAILED_PRECONDITION';
  return STATUSES[error.code];
}

/** The body field a refusal is about, when it is one field of the request. */
const FIELDS: Readonly<Partial<Record<LifecycleErrorCode, string>>> =
  Object.freeze({
    UNKNOWN_TRANSITION: 'transition',
    REQUEST_REUSED: 'requestId',
    INVALID_REQUEST_ID: 'requestId',
  });

/**
 * The standard error fields for a refusal the caller can act on, or
 * `undefined` for one that is the server's own fault — a broken definition,
 * a `route` or `set` that wrote what it may not — which the application
 * answers as an opaque `500` when the plugin rethrows it.
 *
 * | Code                                                                            | Status                |
 * | ------------------------------------------------------------------------------- | --------------------- |
 * | `UNKNOWN_LIFECYCLE`, `RECORD_NOT_FOUND`                                         | `NOT_FOUND`           |
 * | `UNKNOWN_TRANSITION`, `INVALID_INPUT`, `REQUEST_REUSED`, `INVALID_REQUEST_ID`   | `INVALID_ARGUMENT`    |
 * | `GUARD_REJECTED` with a `permission` blocker                                    | `PERMISSION_DENIED`   |
 * | `GUARD_REJECTED` whose blockers are all `precondition`                          | `FAILED_PRECONDITION` |
 * | `INVALID_STATE`, `UNKNOWN_EFFECT`, `RUN_SETTLED`                                | `FAILED_PRECONDITION` |
 * | `CONFLICT`                                                                      | `ABORTED`             |
 */
export function lifecycleErrorFields(
  error: LifecycleError,
  options: LifecycleApiErrorOptions = {},
): LifecycleApiErrorFields | undefined {
  const status = statusOf(error);
  if (!status) return undefined;
  const at = (field: string): string =>
    options.inputField ? `${options.inputField}.${field}` : field;
  const field = FIELDS[error.code];
  const violations: LifecycleApiFieldViolation[] = field
    ? [{ field, description: error.message }]
    : error.problems.map((problem) => ({
        field: problem.field ? at(problem.field) : (options.inputField ?? ''),
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
