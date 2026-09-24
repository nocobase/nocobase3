import { useTranslation } from '@nocobase/i18n/client';

import { AUTHORIZATION_NAMESPACE } from '../shared.js';

export { AUTHORIZATION_NAMESPACE };

/** The library's titles are translated from this plugin's catalogue. */
export const LIBRARY_NAMESPACE = '@nocobase/authorization';

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
  value: string | { key: string; ns?: string } | undefined,
  t: Translate,
  fallback = '',
): string {
  if (typeof value !== 'object') return value ?? fallback;
  const ns =
    value.ns === undefined || value.ns === LIBRARY_NAMESPACE
      ? AUTHORIZATION_NAMESPACE
      : value.ns;
  return t(value.key, { ns, defaultValue: value.key });
}
