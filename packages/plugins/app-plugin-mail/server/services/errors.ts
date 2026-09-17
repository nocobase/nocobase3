import { MAIL_PROVIDER_ERROR_CATEGORIES } from '../../shared/mail.js';

export function assertProviderResult<T>(
  result: import('../../shared/mail.js').MailProviderResult<T>,
): T {
  if (!result.ok)
    throw Object.assign(new Error(result.error.message), result.error);
  return result.value;
}

export function toManagementActionError(
  cause: unknown,
): import('../../shared/mail.js').MailPublicError {
  if (isMailProviderError(cause)) return toPublicError(cause);
  return {
    code: 'MAIL_MANAGEMENT_ACTION_FAILED',
    category: 'unknown',
    retryable: false,
  };
}

function isMailProviderError(
  value: unknown,
): value is import('../../shared/mail.js').MailProviderError {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    typeof value.category === 'string' &&
    (MAIL_PROVIDER_ERROR_CATEGORIES as readonly string[]).includes(
      value.category,
    ) &&
    typeof value.retryable === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toPublicError(
  error: import('../../shared/mail.js').MailProviderError,
): import('../../shared/mail.js').MailPublicError {
  return {
    code: error.code,
    category: error.category,
    retryable: error.retryable,
    retryAfterMs: error.retryAfterMs,
    ...(error.recipients ? { recipients: error.recipients } : {}),
  };
}
