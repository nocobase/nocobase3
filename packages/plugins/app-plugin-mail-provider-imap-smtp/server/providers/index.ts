import type { AppPluginProviderConstructor } from '@nocobase/app-server/plugins';

import { MailProviderImapSmtpProvider } from './mail-provider-imap-smtp.js';

export const serviceProviders: readonly AppPluginProviderConstructor[] = [
  MailProviderImapSmtpProvider,
];

export default serviceProviders;
