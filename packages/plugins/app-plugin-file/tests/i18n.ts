import { I18nRuntime, type Locale, type LocalesModule } from '@nocobase/i18n';

import { FILE_PLUGIN_NS } from '../shared/namespace.js';

const TEST_APP_NS = '@nocobase/app-plugin-file-test-app';

export async function createFileI18nRuntime(
  module: LocalesModule,
  locale: Locale = 'en-US',
): Promise<I18nRuntime> {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: TEST_APP_NS,
  });
  runtime.registerNamespace(FILE_PLUGIN_NS, module);
  await runtime.init(locale);
  return runtime;
}

export { TEST_APP_NS };
