import {
  defineClientSettings,
  type AppClientSettingDefinition,
} from '@nocobase/app-client/plugins';

const settings: readonly AppClientSettingDefinition[] = defineClientSettings([
  {
    id: __NOCOBASE_SHORT_NAME_LITERAL__,
    title: __NOCOBASE_DISPLAY_NAME_LITERAL__,
    pageLoader: () => import('./pages/settings.js'),
  },
]);

export default settings;
