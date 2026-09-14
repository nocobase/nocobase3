import type { Translator } from '@nocobase/i18n/server';

import { IN_APP_NOTIFICATION_NAMESPACE } from './i18n.js';

interface InAppNotificationErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly ns: string;
    readonly key: string;
    readonly params?: Record<string, unknown>;
  };
}

export function inAppNotificationErrorBody(
  t: Translator,
  code: string,
  key: string,
  defaultValue: string,
  params?: Record<string, unknown>,
): InAppNotificationErrorBody {
  return {
    error: {
      code,
      message: t(key, { defaultValue, ...params }),
      ns: IN_APP_NOTIFICATION_NAMESPACE,
      key,
      ...(params ? { params } : {}),
    },
  };
}
