export type LifecycleErrorCode =
  | 'INVALID_DEFINITION'
  | 'UNKNOWN_LIFECYCLE'
  | 'UNKNOWN_TRANSITION'
  | 'RECORD_NOT_FOUND'
  | 'INVALID_STATE'
  | 'GUARD_REJECTED'
  | 'INVALID_INPUT'
  | 'INVALID_ROUTE'
  | 'INVALID_SET'
  | 'UNKNOWN_EFFECT'
  | 'CONFLICT'
  | 'REQUEST_REUSED';

/**
 * Why a transition may not run for this actor now: the state it is in, or a
 * guard that said no. `code` is stable for a client to branch on; `message`
 * is what to show the person.
 */
export interface Blocker {
  readonly source: 'state' | 'guard';
  readonly code: string;
  readonly message: string;
}

/** One thing wrong with a transition's input; `field` names it when it is one field. */
export interface InputProblem {
  readonly field?: string;
  readonly message: string;
}

export interface LifecycleErrorDetails {
  readonly blockers?: readonly Blocker[];
  readonly problems?: readonly InputProblem[];
}

/**
 * Every refusal the lifecycle makes, with a stable code a route can map to an
 * HTTP status. A refused transition changes nothing. A guard refusal carries
 * its blockers and an input refusal its problems, so a page can say why.
 */
export class LifecycleError extends Error {
  public readonly code: LifecycleErrorCode;
  public readonly blockers: readonly Blocker[];
  public readonly problems: readonly InputProblem[];

  public constructor(
    code: LifecycleErrorCode,
    message: string,
    details: LifecycleErrorDetails = {},
  ) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
    this.blockers = details.blockers ?? [];
    this.problems = details.problems ?? [];
  }
}
