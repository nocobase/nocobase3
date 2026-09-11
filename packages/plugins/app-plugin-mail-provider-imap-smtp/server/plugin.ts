import {
  defineServerPlugin,
  type AppServerPlugin,
} from '@nocobase/app-server/plugins';

import serviceProviders from './providers/index.js';
import { imapSmtpMailProviderConfig } from './config.js';

const mailProviderImapSmtpPlugin: AppServerPlugin = defineServerPlugin({
  packageName: '@nocobase/app-plugin-mail-provider-imap-smtp',
  config: imapSmtpMailProviderConfig,
  serviceProviders,
});

export default mailProviderImapSmtpPlugin;
