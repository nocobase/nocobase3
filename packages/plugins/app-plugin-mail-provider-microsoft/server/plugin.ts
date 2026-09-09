import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import { microsoftMailProviderConfig } from './config.js';

const mailProviderMicrosoftPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail-provider-microsoft',
  config: microsoftMailProviderConfig,
  serviceProviders,
});

export default mailProviderMicrosoftPlugin;
