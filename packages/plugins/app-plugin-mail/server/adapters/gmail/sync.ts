import type { MailSyncCursor } from '../../types.js';

import type { GmailCursorValue } from './types.js';

export function gmailCursor(
  historyId: string,
  pageToken?: string,
  capturedAt?: string,
): MailSyncCursor {
  return {
    value: {
      historyId,
      ...(pageToken ? { pageToken } : {}),
      ...(capturedAt ? { capturedAt } : {}),
    },
    version: 'gmail-v1',
  };
}

export function gmailRecoveryCursor(
  historyId: string,
  capturedAt: string | undefined,
  recoveryAfter: string,
  recoveryPageToken: string,
): MailSyncCursor {
  return {
    value: {
      historyId,
      ...(capturedAt ? { capturedAt } : {}),
      recoveryAfter,
      recoveryHistoryId: historyId,
      recoveryPageToken,
    },
    version: 'gmail-v1',
  };
}

export function parseGmailCursor(
  cursor: MailSyncCursor | undefined,
): GmailCursorValue | undefined {
  const value = cursor?.value;
  return value &&
    typeof value === 'object' &&
    typeof value.historyId === 'string'
    ? {
        historyId: value.historyId,
        pageToken:
          typeof value.pageToken === 'string' ? value.pageToken : undefined,
        capturedAt:
          typeof value.capturedAt === 'string' ? value.capturedAt : undefined,
        recoveryHistoryId:
          typeof value.recoveryHistoryId === 'string'
            ? value.recoveryHistoryId
            : undefined,
        recoveryAfter:
          typeof value.recoveryAfter === 'string'
            ? value.recoveryAfter
            : undefined,
        recoveryPageToken:
          typeof value.recoveryPageToken === 'string'
            ? value.recoveryPageToken
            : undefined,
      }
    : undefined;
}

export function recoveryStart(capturedAt: string | undefined): string {
  const capturedTime = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  const start = Number.isFinite(capturedTime)
    ? capturedTime - 1_000
    : Date.now() - 7 * 24 * 60 * 60 * 1_000;
  return new Date(start).toISOString();
}
