import type * as I18nClient from '@nocobase/i18n/client';
import { translate } from './locale-harness.js';

type I18nClientModule = typeof I18nClient;

/**
 * `@nocobase/i18n/client` translating from the shipped English catalogue,
 * unless the test mounts a real runtime with `I18nProvider`:
 *
 * ```ts
 * vi.mock('@nocobase/i18n/client', async (importOriginal) =>
 *   (await import('../helpers/react.js')).translationMock(importOriginal),
 * );
 * ```
 */
export async function translationMock(
  importOriginal: () => Promise<unknown>,
): Promise<I18nClientModule> {
  const actual = (await importOriginal()) as I18nClientModule;
  const useTranslation = ((
    ...args: Parameters<I18nClientModule['useTranslation']>
  ) => {
    const real = actual.useTranslation(...args);
    return actual.useOptionalI18nRuntime() ? real : { ...real, t: translate };
  }) as I18nClientModule['useTranslation'];
  return { ...actual, useTranslation };
}
