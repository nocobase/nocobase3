import type { MailProviderError, MailProviderResult } from '../../types.js';

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new Error('Operation aborted.');
}

export function failure<T>(
  code: string,
  message: string,
  category: MailProviderError['category'],
  retryable: boolean,
): MailProviderResult<T> {
  return { ok: false, error: { code, message, category, retryable } };
}

export function classifyError(error: unknown, code: string): MailProviderError {
  const value = error as {
    code?: unknown;
    responseCode?: unknown;
    message?: unknown;
  };
  const providerCode = typeof value.code === 'string' ? value.code : code;
  const responseCode =
    typeof value.responseCode === 'number' ? value.responseCode : undefined;
  const category =
    providerCode === 'EAUTH' || responseCode === 401 || responseCode === 535
      ? 'authentication'
      : providerCode === 'EENVELOPE'
        ? 'recipient'
        : providerCode === 'ETIMEDOUT'
          ? 'timeout'
          : NETWORK_CODES.has(providerCode)
            ? 'network'
            : 'provider';
  return {
    code: providerCode,
    message:
      typeof value.message === 'string' ? value.message : `${code} failed.`,
    category,
    retryable:
      category === 'network' ||
      category === 'timeout' ||
      (responseCode !== undefined && responseCode >= 500),
  };
}

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ESOCKET',
  'ECONNECTION',
]);
