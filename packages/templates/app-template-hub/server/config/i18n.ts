import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppI18nConfig } from '@nocobase/app-server/i18n';

const i18n: AppConfigFactory<AppI18nConfig> = defineAppConfig((_runtime) => ({
  defaultLocale: 'en-US',
  locales: ['en-US', 'zh-CN'],
}));

export default i18n;
