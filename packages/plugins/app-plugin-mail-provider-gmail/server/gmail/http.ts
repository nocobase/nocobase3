import type {
  MailProviderError,
  MailProviderResult,
  MailProviderSendResult,
} from '@nocobase/app-plugin-mail/server/types';

import type { GmailMailProviderConfig } from './types.js';
import { unknownError } from './errors.js';
import { HTTP_TIMEOUT_MS, MAX_PROVIDER_JSON_BYTES } from './constants.js';

export function fetchWithTimeout(
  input: Parameters<typeof globalThis.fetch>[0],
  init: RequestInit = {},
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(HTTP_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return globalThis.fetch(input, { ...init, signal });
}

export async function readJson<T>(response: Response): Promise<T> {
  if (!response.body) return (await response.json()) as T;
  const reader =
    response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > MAX_PROVIDER_JSON_BYTES) {
      await reader.cancel();
      throw new Error('Gmail Provider response exceeded the size limit.');
    }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

export async function gmailRequest<T>(
  config: GmailMailProviderConfig,
  accessToken: string,
  path: string,
  init: RequestInit,
): Promise<MailProviderResult<T>> {
  try {
    const response = await fetchWithTimeout(`${apiBase(config)}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
      },
    });
    return response.ok
      ? { ok: true, value: await readJson<T>(response) }
      : { ok: false, error: await responseError('GMAIL', response) };
  } catch (error) {
    return { ok: false, error: unknownError(error, 'GMAIL_REQUEST_FAILED') };
  }
}

export function apiBase(config: GmailMailProviderConfig): string {
  return (config.apiBaseUrl ?? 'https://gmail.googleapis.com/gmail/v1').replace(
    /\/$/,
    '',
  );
}

export async function responseError(
  prefix: string,
  response: Response,
): Promise<MailProviderError> {
  let message = `${prefix} request failed with status ${response.status}.`;
  try {
    const body = await readJson<{
      error?: { message?: string } | string;
      error_description?: string;
    }>(response);
    message =
      typeof body.error === 'string'
        ? (body.error_description ?? body.error)
        : (body.error?.message ?? message);
  } catch {
    // Some Provider errors do not use a JSON response body.
  }
  const retryAfter = Number(response.headers.get('retry-after'));
  return {
    code: `${prefix}_HTTP_${response.status}`,
    message,
    category:
      response.status === 401 || response.status === 403
        ? 'authentication'
        : response.status === 429
          ? 'rate_limit'
          : response.status >= 500
            ? 'provider'
            : 'provider',
    retryable: response.status === 429 || response.status >= 500,
    retryAfterMs:
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : undefined,
  };
}

export async function submissionResponse(
  response: Response,
): Promise<MailProviderSendResult> {
  const error = await responseError('GMAIL', response);
  return {
    status: response.status >= 500 ? 'submission_unknown' : 'failed',
    error: response.status >= 500 ? { ...error, retryable: false } : error,
  };
}
