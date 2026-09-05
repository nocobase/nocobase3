import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import { gmailMailProviderConfig } from './config.js';

const mailProviderGmailPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail-provider-gmail',
  config: gmailMailProviderConfig,
  serviceProviders,
});

export default mailProviderGmailPlugin;
