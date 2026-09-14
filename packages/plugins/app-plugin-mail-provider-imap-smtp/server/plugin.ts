import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';

const mailProviderImapSmtpPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail-provider-imap-smtp',
  serviceProviders,
});

export default mailProviderImapSmtpPlugin;
