import { useTranslation } from '@nocobase/i18n/client';
import { useCallback } from 'react';

import { NOCOBASE_AI_KNOWLEDGE_BASE_I18N_NAMESPACE } from './locales/index.js';

export function useKnowledgeBaseComponentTranslate(): (
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
