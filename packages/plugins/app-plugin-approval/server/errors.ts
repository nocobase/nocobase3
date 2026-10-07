export type ApprovalErrorCode =
  | 'TASK_NOT_FOUND'
  | 'TASK_CLOSED'
  | 'ALREADY_ANSWERED'
  | 'NOT_YOUR_TURN'
  | 'CLAIM_FIRST'
  | 'NOT_ASSIGNEE'
  | 'INACTIVE'
  | 'STALE'
  | 'CONTENT_CHANGED'
  | 'STALE_CONTENT'
  | 'REASON_REQUIRED'
  | 'INVALID_ANSWER'
  | 'INVALID_TARGET'
  | 'NOT_ALLOWED'
  | 'APPLICANT_NOT_ELIGIBLE'
  | 'ALREADY_RESPONSIBLE'
  | 'NOT_QUALIFIED'
  | 'NOT_IN_POOL'
  | 'NO_ASSIGNEE'
  | 'NO_STAGE'
  | 'CONFLICT';

/**
 * A refusal of the approval layer: a task that is not the actor's to
 * answer, a stale page, a missing reason. Nothing is written when one is
 * thrown, because each operation runs in one transaction.
 */
export class ApprovalError extends Error {
  public readonly code: ApprovalErrorCode;

  public constructor(code: ApprovalErrorCode, message: string) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}
