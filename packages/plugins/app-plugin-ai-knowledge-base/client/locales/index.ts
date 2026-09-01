import { useTranslation } from '@nocobase/i18n/client';
import type { LocaleLoaders } from '@nocobase/i18n';
import { useCallback } from 'react';

export const NOCOBASE_AI_KNOWLEDGE_BASE_I18N_NAMESPACE =
  '@nocobase/app-plugin-ai-knowledge-base';

const locales: LocaleLoaders = {
  'en-US': () => import('./en-US.js'),
  'zh-CN': () => import('./zh-CN.js'),
};

export default locales;

export function useT(): (
  key: string,
  options?: Record<string, unknown>,
) => string {
  const { t } = useTranslation(NOCOBASE_AI_KNOWLEDGE_BASE_I18N_NAMESPACE);

  return useCallback(
    (key: string, options: Record<string, unknown> = {}) =>
      t(key, { ...options, defaultValue: key }),
    [t],
  );
}
