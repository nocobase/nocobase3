import { useTranslation } from '@nocobase/i18n/client';
import type { LocaleLoaders } from '@nocobase/i18n';
import { useCallback } from 'react';

import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

const locales: LocaleLoaders = {
  'en-US': () => import('./en-US.js'),
  'zh-CN': () => import('./zh-CN.js'),
};

export default locales;

export function useT(): (
  key: string,
  options?: Record<string, unknown>,
) => string {
  const { t } = useTranslation(packageMetadata.name);
  return useCallback(
    (key: string, options: Record<string, unknown> = {}) =>
      t(key, { ...options, defaultValue: key }),
    [t],
  );
}
