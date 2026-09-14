import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';

const mailProviderMicrosoftPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail-provider-microsoft',
  serviceProviders,
});

export default mailProviderMicrosoftPlugin;
