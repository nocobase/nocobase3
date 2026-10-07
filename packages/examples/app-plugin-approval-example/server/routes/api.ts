import { ApiError, type ApiErrorStatus } from '@nocobase/app-server/router';
import {
  LifecycleError,
  lifecycleErrorFields,
  type LifecycleRecord,
} from '@nocobase/lifecycle';
import { ApprovalError } from '@nocobase/app-plugin-approval/server';
import { ExampleError } from '../lab/errors.js';
import { EXAMPLE_ROUTES } from '../../shared/routes.js';
export const APPROVAL_EXAMPLE_DOMAIN: string = EXAMPLE_ROUTES;
export const tags: string[] = ['ApprovalExample'];
export function toApiError(error: unknown, inputField?: string): unknown {
  if (error instanceof LifecycleError) {
    const fields = lifecycleErrorFields(
      error,
      inputField ? { inputField } : {},
    );
    return fields ? new ApiError({ ...fields, domain: EXAMPLE_ROUTES }) : error;
  }
  if (error instanceof ExampleError) {
    const statuses: Record<ExampleError['code'], ApiErrorStatus> = {
      NOT_FOUND: 'NOT_FOUND',
      FORBIDDEN: 'PERMISSION_DENIED',
      INVALID: 'INVALID_ARGUMENT',
    };
    return new ApiError({
      status: statuses[error.code],
      reason: error.reason,
      domain: EXAMPLE_ROUTES,
      message: error.message,
      ...(error.code === 'INVALID'
        ? {
            fieldViolations: [
              { field: error.reason, description: error.message },
            ],
          }
        : {}),
    });
  }
  if (error instanceof ApprovalError) {
    const permission = [
      'NOT_ASSIGNEE',
      'NOT_ALLOWED',
      'NOT_QUALIFIED',
      'INACTIVE',
    ];
    const conflict = [
      'CONFLICT',
      'STALE',
      'STALE_CONTENT',
      'CONTENT_CHANGED',
      'TASK_CLOSED',
      'ALREADY_ANSWERED',
    ];
    return new ApiError({
      status:
        error.code === 'TASK_NOT_FOUND'
          ? 'NOT_FOUND'
          : permission.includes(error.code)
            ? 'PERMISSION_DENIED'
            : conflict.includes(error.code)
              ? 'ABORTED'
              : 'FAILED_PRECONDITION',
      reason: error.code,
      domain: EXAMPLE_ROUTES,
      message: error.message,
    });
  }
  return error;
}
export function outwardView<V extends { readonly record: LifecycleRecord }>(
  view: V,
): V {
  return { ...view, record: { ...view.record, id: String(view.record.id) } };
}
