import {
  defineConfig,
  type ConfigFactory,
} from '@nocobase/app-server-kit/config';
import type { AppI18nConfig } from '@nocobase/app-server-kit/i18n';

/**
 * Languages the application offers, and the one it answers in when a request expresses no preference.
 *
 * The list has to match what `client/plugins.ts` passes to the i18n plugin; a language enabled on one side only is
 * either unreachable in the interface or unavailable from the server.
 */
const i18nConfig: ConfigFactory<AppI18nConfig> = defineConfig(
  ({ env }): AppI18nConfig => ({
    defaultLocale: env.string('APP_DEFAULT_LOCALE', 'en-US'),
    locales: env
      .string('APP_LOCALES', 'en-US,zh-CN')
      .split(',')
      .map((locale) => locale.trim())
      .filter(Boolean),
  }),
);

export default i18nConfig;
