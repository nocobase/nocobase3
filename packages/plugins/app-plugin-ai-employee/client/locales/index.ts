import {
  getCurrentLocale,
  registerTranslationResources,
} from '@nocobase/app-portal-sdk/i18n';
import { useTranslate } from '@refinedev/core';
import { useCallback } from 'react';

import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };
import enUS from './en-US.js';
import zhCN from './zh-CN.js';

registerTranslationResources(packageMetadata.name, {
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
      return translate(key, { ns: packageMetadata.name }, fallback);
    },
    [translate],
  );
}
