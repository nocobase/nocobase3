import type { Translator } from '@nocobase/i18n/server';

import { NOTIFICATION_NAMESPACE } from './types.js';

interface NotificationErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly ns: string;
    readonly key: string;
    readonly params?: Record<string, unknown>;
  };
}

export function notificationErrorBody(
  t: Translator,
  code: string,
  key: string,
  defaultValue: string,
  params?: Record<string, unknown>,
): NotificationErrorBody {
  return {
    error: {
      code,
      message: t(key, { defaultValue, ...params }),
      ns: NOTIFICATION_NAMESPACE,
      key,
      ...(params ? { params } : {}),
    },
  };
}
