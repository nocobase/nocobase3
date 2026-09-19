import { useCallback } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import {
  useAuthorizationTranslation as useSharedTranslation,
  type Translate,
} from '@nocobase/app-plugin-authorization/client/management';
export type { Translate } from '@nocobase/app-plugin-authorization/client/management';
export function useRuleTranslation(): Translate {
  const { t } = useTranslation('@nocobase/app-plugin-authz-sharing-rules');
  const shared = useSharedTranslation();
  return useCallback(
    (key, options) =>
      key.startsWith('sharingRules.') ? t(key, options) : shared(key, options),
    [t, shared],
  );
}
export { useRuleTranslation as useAuthorizationTranslation };
