import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';

const mailProviderGmailPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail-provider-gmail',
  serviceProviders,
});

export default mailProviderGmailPlugin;
