import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

import locales from './locales/index.js';
import serviceProviders from './service-provider.js';

export interface I18nClientOptions {
  readonly placeholder?: never;
}

const i18n: AppClientPluginFactory<I18nClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-i18n',
  locales,
  serviceProviders,
});

export default i18n;
