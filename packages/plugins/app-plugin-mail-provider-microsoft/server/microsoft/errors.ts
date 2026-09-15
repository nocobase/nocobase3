import type {
  MailProviderError,
  MailProviderResult,
} from '@nocobase/app-plugin-mail/server/types';

export function unknownError(error: unknown, code: string): MailProviderError {
  return {
    code,
    message:
      error instanceof Error ? error.message : 'Microsoft request failed.',
    category: 'network',
    retryable: true,
  };
}

export function contentPreparationError(
  error: unknown,
  code: string,
): MailProviderError {
  return {
    code,
    message:
      error instanceof Error
        ? error.message
        : 'Mail content preparation failed.',
    category: 'content',
    retryable: false,
  };
}

export class ProviderRequestError extends Error {
  public constructor(public readonly providerError: MailProviderError) {
    super(providerError.message);
  }
}

export function errorResult(error: unknown, code: string): MailProviderError {
  return error instanceof ProviderRequestError
    ? error.providerError
    : unknownError(error, code);
}

export function failure<T>(
  code: string,
  message: string,
  category: MailProviderError['category'],
  retryable: boolean,
): MailProviderResult<T> {
  return { ok: false, error: { code, message, category, retryable } };
}

export function invalidPushNotification<T>(): MailProviderResult<T> {
  return failure(
    'MICROSOFT_PUSH_NOTIFICATION_INVALID',
    'Microsoft Graph push notification payload is invalid.',
    'provider',
    false,
  );
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
