import { useTranslation } from '@nocobase/i18n/client';

/** The namespace this plugin's catalogues are registered under: its package name. */
export const AUTHORIZATION_NAMESPACE: string =
  '@nocobase/app-plugin-authorization';

/** What a label helper needs: the narrow shape of i18next's `t`. */
export type Translate = (
  key: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

export function useAuthorizationTranslation(): Translate {
  const { t } = useTranslation(AUTHORIZATION_NAMESPACE);
  return t;
}
