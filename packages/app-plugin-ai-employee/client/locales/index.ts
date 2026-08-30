import {
  getCurrentLocale,
  registerTranslationResources,
} from '@nocobase/app-portal-sdk/i18n';
import { useTranslate } from '@refinedev/core';
import { useCallback } from 'react';

import { AI_EMPLOYEE_I18N_NAMESPACE } from '../../namespace.js';
import enUS from './en-US.js';
import zhCN from './zh-CN.js';

registerTranslationResources(AI_EMPLOYEE_I18N_NAMESPACE, {
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
      return translate(key, { ns: AI_EMPLOYEE_I18N_NAMESPACE }, fallback);
    },
    [translate],
  );
}
