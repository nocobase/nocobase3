import { useTranslation } from '@nocobase/i18n/client';
import { useCallback } from 'react';

import enUS from './en-US.js';
import zhCN from './zh-CN.js';
import type { NocoBaseAITranslationKey } from './index.js';

function interpolate(
  template: string,
  values: Readonly<Record<string, unknown>>,
): string {
  return template.replace(/\{\{\s*([^}\s]+)\s*\}\}/gu, (_, key: string) =>
    key in values ? String(values[key]) : `{{${key}}}`,
  );
}

export function useAITranslate(): (
  key: string,
  fallback: string,
  options?: Readonly<Record<string, unknown>>,
) => string {
  const { i18n } = useTranslation();
  const messages = i18n.resolvedLanguage?.toLowerCase().startsWith('zh')
    ? zhCN
    : enUS;

  return useCallback(
    (
      key: string,
      fallback: string,
      options: Readonly<Record<string, unknown>> = {},
    ): string => {
      const template =
        messages[key as NocoBaseAITranslationKey] ?? fallback ?? key;
      return interpolate(template, options);
    },
    [messages],
  );
}
