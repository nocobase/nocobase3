import {
  defineClientPlugin,
  type AppClientPluginFactory,
} from '@nocobase/app-client/plugins';

export interface I18nClientOptions {
  readonly placeholder?: never;
}

const i18n: AppClientPluginFactory<I18nClientOptions> = defineClientPlugin({
  packageName: '@nocobase/app-plugin-i18n',
  locales: () => import('./locales/index.js'),
});

export default i18n;
