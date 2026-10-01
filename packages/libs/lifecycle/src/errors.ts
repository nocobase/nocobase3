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
  | 'CONFLICT';

/**
 * Every refusal the lifecycle makes, with a stable code a route can map to an
 * HTTP status. A refused transition changes nothing.
 */
export class LifecycleError extends Error {
  public readonly code: LifecycleErrorCode;

  public constructor(code: LifecycleErrorCode, message: string) {
    super(message);
    this.name = 'LifecycleError';
    this.code = code;
  }
}
