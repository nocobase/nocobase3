import {
  getCurrentLocale,
  registerTranslationResources,
} from '@nocobase/app-portal-sdk/i18n';
import { useTranslate } from '@refinedev/core';
import { useCallback } from 'react';

import enUS from './en-US.js';
import zhCN from './zh-CN.js';

export const NOCOBASE_AI_EMPLOYEE_I18N_NAMESPACE = 'nocobase-ai-employee';

registerTranslationResources(NOCOBASE_AI_EMPLOYEE_I18N_NAMESPACE, {
  'en-US': enUS,
  'zh-CN': zhCN,
});

export function useT(): (key: string) => string {
  const translate = useTranslate();
  return useCallback(
    (key: string) => {
      const resources = getCurrentLocale().toLowerCase().startsWith('zh')
        ? zhCN
        : enUS;
      const fallback = resources[key as keyof typeof resources] ?? key;
      return translate(
        key,
        { ns: NOCOBASE_AI_EMPLOYEE_I18N_NAMESPACE },
        fallback,
      );
    },
    [translate],
  );
}
