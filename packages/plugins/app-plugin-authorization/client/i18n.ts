import { useTranslation } from '@nocobase/i18n/client';

import { AUTHORIZATION_NAMESPACE } from '../shared.js';

export { AUTHORIZATION_NAMESPACE };

/** What a label helper needs: the narrow shape of i18next's `t`. */
export type Translate = (
  key: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

export function useAuthorizationTranslation(): Translate {
  const { t } = useTranslation(AUTHORIZATION_NAMESPACE);
  return t;
}

export function titleText(
  value: string | { key: string; ns: string } | undefined,
  t: Translate,
  fallback = '',
): string {
  return typeof value === 'object'
    ? t(value.key, { ns: value.ns, defaultValue: value.key })
    : (value ?? fallback);
}
